import { Injectable , NotFoundException} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsEvaluations, StudentsGrade, Members } from "./types/students.type";
import { PaginatedResult } from 'src/common/types/paginated-result.type';

@Injectable()
export class StudentsService {
    constructor(private readonly prisma: PrismaService) {}

    async editNrc(
        userId: string,
        memberId: number,
        nrcCodeEdit: number,
        nrcCodeNew: number,
    ): Promise<boolean> {
        if (!userId) {
            throw new NotFoundException("user not found");
        }
        
        const oldNrc = await this.prisma.nRC.findFirst({
            where: { code: nrcCodeEdit },
            select: { id: true }
        });
        const newNrc = await this.prisma.nRC.findFirst({
            where: { code: nrcCodeNew },
            select: { id: true }
        });
        if (!oldNrc) {
        throw new NotFoundException("NRC to remove not found");
        }
        if (!newNrc) {
            throw new NotFoundException("NRC to add not found");
        }
        
        await this.prisma.member.update({
        where: { id: memberId },
        data: {
            nrcs: {
                disconnect: { id: oldNrc.id },
                connect: { id: newNrc.id }
            }
        }
        });
        return true;
    }


    async getMembers(
        userId: string,
        page: number,
        limit: number
    ): Promise<PaginatedResult<Members>> {
        const offset = (page - 1) * limit;

        if (!userId) {
            throw new NotFoundException("user not found");
        }
        const member = await this.prisma.team.findUnique({
            where: { userId: userId },
            select: {
                members: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        studentCode: true,
                        nrcs: {
                            select: {
                                code: true,
                            }
                        }
                    }
                }
            }
        });

        if (!member || !member.members || member.members.length === 0) {
            throw new NotFoundException("No members found");
        }
        const totalItems = member.members.length;

        const totalPages = Math.ceil(totalItems / limit);
        
        return {
            data: member.members.map((member: any) => ({
                id: member.id,
                firstName: member.firstName,
                lastName: member.lastName,
                email: member.email,
                studentCode: member.studentCode,
                nrc: member.nrcs?.map((nrc: any) => nrc.code) ?? [],
            })),
            metadata: {
                totalItems,
                itemsOnCurrentPage: totalItems,
                currentPage: page,
                itemsPerPage: limit,
                totalPages
            }
        };
    }

    async getStudentsGrades(
        userId: string
    ): Promise<StudentsGrade> {
        if (!userId) {
            throw new NotFoundException("user not found");
        }
        const videogame = await this.prisma.team.findUnique({
            where: { userId: userId },
            select:{
                videogame: {
                    select:{
                        id : true,
                    }
                }
            }
        });
        if (!videogame?.videogame) {
            throw new NotFoundException("team not found");
        }
        console.log(videogame.videogame.id)
        const studentsGrades = await this.prisma.evaluation.findMany({
            where: { videogameId: videogame.videogame.id },
            select: {
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
        return { 
            grade : average
        };
    }

    async getStudentsEvaluations(
        page: number,
        limit: number,
        userId: string
    ): Promise<PaginatedResult<StudentsEvaluations>> {
    const offset = (page - 1) * limit;

    if (!userId) {
        throw new NotFoundException("user not found");
    }
    const videogame = await this.prisma.team.findUnique({
            where: { userId: userId },
            select:{
                videogame: {
                    select:{
                        id : true,
                    }
                }
            }
        });
    if (!videogame?.videogame) {
        throw new NotFoundException("videogame not found");
    }

    const whereClause = {
        videogameId: videogame.videogame.id,
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