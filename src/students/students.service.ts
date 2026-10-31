import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsEvaluations, StudentsGrade} from "./types/students.type";
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { findNrcIdsByCodes } from "src/nrcs/nrc-lookup";
import { Member, Prisma } from "@prisma/client";
import { AppUser } from "../auth/jwt.strategy";
import { ROLE_IDS } from "../auth/constants/roles";

@Injectable()
export class StudentsService {
    constructor(private readonly prisma: PrismaService) { }

    async editNrc(
        user: AppUser,
        memberId: number,
        nrcCodes: number[],
    ): Promise<Member> {

        const selectClause: Prisma.MemberSelect = {
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
        };

        try {
            return await this.prisma.$transaction(async (tx) => {
                const member = await tx.member.findUnique({
                    where: { id: memberId },
                    select: {
                        id: true,
                        team: {
                            select: { userId: true, editionId: true }
                        }
                    }
                });

                if (!member)
                    throw new NotFoundException("The provided member does not exist or is inactive")

                if (member.team.userId !== user.id && user.roleId !== ROLE_IDS.ADMIN) {
                    throw new ForbiddenException(
                        'You are not authorized to modify NRCs for this member.',
                    );
                }


                const newNrc = await findNrcIdsByCodes(
                    tx,
                    nrcCodes,
                    member.team.editionId,
                );

                if (newNrc.missing.length > 0) {
                    throw new NotFoundException("One or more NRCs not found");
                }

                const updatedMember = await tx.member.update({
                    where: { id: memberId },
                    data: {
                        nrcs: {
                            set: newNrc.ids.map(id => ({ id }))
                        }
                    },
                    select: selectClause,
                });

                return updatedMember;

            });
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof ForbiddenException) {
                throw error;
            }
            console.error('Failed to set NRCs for member:', error);
            throw new InternalServerErrorException('An error occurred while updating member NRCs.');
        }
    }


    async getMembers(
        userId: string,
    ): Promise<Member[]> {

        const whereClause: Prisma.MemberWhereInput = {
            team: {
                userId: userId
            }
        };

        const selectClause: Prisma.MemberSelect = {
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

        const members = await this.prisma.member.findMany({
            where: whereClause,
            select: selectClause
        });

        if (members.length === 0) {
            throw new NotFoundException("No members found for this team");
        }


        return members
    }

    async getStudentsGrades(
        userId: string
    ): Promise<StudentsGrade> {
        if (!userId) {
            throw new NotFoundException("user not found");
        }
        const videogame = await this.prisma.team.findUnique({
            where: { userId: userId },
            select: {
                videogame: {
                    select: {
                        id: true,
                    }
                }
            }
        });
        if (!videogame?.videogame) {
            throw new NotFoundException("team not found");
        }
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
            grade: average
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
            select: {
                videogame: {
                    select: {
                        id: true,
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

    async getMyJudges(userId: string) {
        if (!userId) {
            throw new NotFoundException('user not found');
        }

        // 1. Obtener el equipo del estudiante con su videojuego y jurados asignados
        const team = await this.prisma.team.findUnique({
            where: { userId },
            select: {
                id: true,
                videogame: {
                    select: { id: true },
                },
                assignedJurors: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        jurorCategory: true,
                        roleId: true,
                        role: {
                            select: { name: true },
                        },
                    },
                },
            },
        });

        if (!team) {
            throw new NotFoundException('Team not found for this user');
        }

        const videogameId = team.videogame?.id ?? null;
        const jurorIds = team.assignedJurors.map((j) => j.id);

        // 2. Obtener las evaluaciones de esos jurados para el videojuego del equipo
        let evaluationsMap = new Map<string, number | null>();

        if (videogameId && jurorIds.length > 0) {
            const evaluations = await this.prisma.evaluation.findMany({
                where: {
                    isActive: true,
                    videogameId,
                    jurorId: { in: jurorIds },
                },
                select: {
                    jurorId: true,
                    totalScore: true,
                },
            });

            for (const ev of evaluations) {
                evaluationsMap.set(ev.jurorId, ev.totalScore);
            }
        }

        // 3. Armar la respuesta
        return team.assignedJurors.map((juror) => {
            const roleName = juror.role?.name ?? '';
            let categoria: string;
            if (roleName === 'Profesor') {
                categoria = 'PROFESOR';
            } else {
                categoria = juror.jurorCategory ?? 'SIN_CATEGORIA';
            }

            const hasEvaluation = evaluationsMap.has(juror.id);
            const totalScore = hasEvaluation ? evaluationsMap.get(juror.id) : null;

            return {
                id: juror.id,
                nombre: `${juror.firstName ?? ''} ${juror.lastName ?? ''}`.trim(),
                categoria,
                totalScore: hasEvaluation ? totalScore : null,
                haEvaluado: hasEvaluation,
            };
        });
    }
}
