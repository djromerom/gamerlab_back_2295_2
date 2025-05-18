import { Injectable , NotFoundException} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsEvaluations, StudentsGrade } from "./types/students.type";
import { PaginatedResult } from 'src/common/types/paginated-result.type';

@Injectable()
export class StudentsService {
    constructor(private readonly prisma: PrismaService) {}
    async getStudentsGrades(
        userId: string
    ): Promise<StudentsGrade[]> {
        if (!userId) {
            throw new NotFoundException("user not found");
        }
        const team = await this.prisma.team.findUnique({
            where: { userId: userId },
            select: {
                id: true
            }
        });
        if (!team) {
            throw new NotFoundException("teamId not found");
        }

        const videogame = await this.prisma.videogame.findUnique({
            where: { teamId: team.id },
            select: {
                id: true,
                name: true,
                logoUrl: true
            }
        });

        if (!videogame) {
            throw new NotFoundException("team not found");
        }

        const studentsGrades = await this.prisma.evaluation.findMany({
            where: { videogameId: videogame.id },
            select: {
                id: true,
                totalScore: true,
            }
        });
        if (!studentsGrades) {
            throw new NotFoundException("No evaluations found");
        }
        var sum: number = 0;
        for (const student of studentsGrades) {
            if (student.totalScore !== null) {
                sum += student.totalScore;
            }
        }
        const average: number = sum / studentsGrades.length;
        const Grades = studentsGrades.map((student) => ({
            teamId: team.id,
            grade: average
        }));
        return Grades;
    }


    async getStudentsEvaluations(
        page: number,
        limit: number,
        userId: string
    ): Promise<PaginatedResult<StudentsEvaluations>> {
    const offset = (page - 1) * limit;
    console.log("userId", userId);
    if (!userId) {
        throw new NotFoundException("user not found");
    }
    const team = await this.prisma.team.findUnique({
        where: { userId: userId },
        select: {
            id: true
        }
    });
    if (!team) {
        throw new NotFoundException("team not found");
    }

    const videogame = await this.prisma.videogame.findUnique({
        where: { teamId: team.id },
            select: {
                id: true,
        }
    });
    if (!videogame) {
        throw new NotFoundException("videogame not found");
    }

    const whereClause = {
        videogameId: videogame.id,
        isActive: true
    };


    const [evaluations, totalItems] = await this.prisma.$transaction([
        this.prisma.evaluation.findMany({
            skip: offset,
            take: limit,
            where: whereClause,
            select: {
                id: true,
                date: true,
                comments: true,
                totalScore: true,
                details: {
                    select: {
                        score: true,
                        criterion: {
                            select: {
                            id: true,
                            name: true,
                            weight: true
                            }
                        }
                    }
                }
            }
        }),
        this.prisma.evaluation.count({
            where: whereClause
        }),
        ]);
        if (!evaluations) {
            throw new NotFoundException("No evaluations found");
        } 
        const totalPages = Math.ceil(totalItems / limit);
        return {
            data: evaluations.map((evaluations) => ({
                evaluationId: evaluations.id,
                evaluationDate: evaluations.date,
                evaluationComment: evaluations.comments ?? null,
                evaluationScore: evaluations.totalScore ?? null,
                evaluationDetails: evaluations.details.map((detail) => ({
                    score: detail.score,
                    criterionId: detail.criterion.id,
                    criterionName: detail.criterion.name,
                    criterionWeight: detail.criterion.weight
                }))
            })),
            metadata: {
                totalItems,
                itemsOnCurrentPage: evaluations.length,
                currentPage: page,
                itemsPerPage: limit,
                totalPages
            }
        };
    }
}