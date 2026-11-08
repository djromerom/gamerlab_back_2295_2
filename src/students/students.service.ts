import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException, HttpException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsEvaluations, StudentsGrade} from "./types/students.type";
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { resolveMemberNrcs } from "src/nrcs/nrc-lookup";
import { Member, Prisma } from "@prisma/client";
import { AppUser } from "../auth/jwt.strategy";
import { ROLE_IDS } from "../auth/constants/roles";
import { activeEditionTeamOf } from "../teams/active-edition-team";
import { assertEditionWritable } from "../editions/active-edition";
import { assertAdminOnly } from '../teams/student-edit-policy';

@Injectable()
export class StudentsService {
    constructor(private readonly prisma: PrismaService) { }

    async editNrc(
        user: AppUser,
        memberId: number,
        nrcCodes: number[],
    ): Promise<Member> {
        // ARK-161 (BG-38): los NRC de un integrante los cambia solo el administrador
        assertAdminOnly(user, 'los NRC de un integrante');

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
                            select: {
                                userId: true,
                                editionId: true,
                                edition: { select: { status: true, title: true } },
                            }
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

                // ARK-130 (HU-27): los integrantes de ediciones anteriores son de solo lectura
                assertEditionWritable(member.team.edition, 'el integrante');


                // HU-31 (ARK-167): NRC activos de la edición y uno solo por materia
                const nrcIds = await resolveMemberNrcs(
                    tx,
                    nrcCodes,
                    member.team.editionId,
                );

                const updatedMember = await tx.member.update({
                    where: { id: memberId },
                    data: {
                        nrcs: {
                            set: nrcIds.map(id => ({ id }))
                        }
                    },
                    select: selectClause,
                });

                return updatedMember;

            });
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            console.error('Failed to set NRCs for member:', error);
            throw new InternalServerErrorException('An error occurred while updating member NRCs.');
        }
    }


    async getMembers(
        userId: string,
    ): Promise<Member[]> {

        // ARK-128: solo los integrantes del equipo que lidera en la edición activa
        const whereClause: Prisma.MemberWhereInput = {
            team: activeEditionTeamOf(userId),
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
        const videogame = await this.prisma.team.findFirst({
            where: activeEditionTeamOf(userId),
            orderBy: { editionId: 'desc' },
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
        // HU-34: la misma nota del ranking (vista), no el promedio de todas las evaluaciones
        const finalScore = await this.prisma.teamFinalScore.findFirst({
            where: { videogameId: videogame.videogame.id },
            select: { finalScore: true },
        });
        return {
            grade: finalScore?.finalScore ?? null,
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
        const videogame = await this.prisma.team.findFirst({
            where: activeEditionTeamOf(userId),
            orderBy: { editionId: 'desc' },
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
        const team = await this.prisma.team.findFirst({
            where: activeEditionTeamOf(userId),
            orderBy: { editionId: 'desc' },
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

        // 2. Qué jurados ya evaluaron el videojuego del equipo.
        // ARK-154 (HU-30): solo si evaluó, nunca la nota que puso (el estudiante ve solo la nota final).
        const evaluatedJurorIds = new Set<string>();

        if (videogameId && jurorIds.length > 0) {
            const evaluations = await this.prisma.evaluation.findMany({
                where: {
                    isActive: true,
                    videogameId,
                    jurorId: { in: jurorIds },
                },
                select: { jurorId: true },
            });

            for (const ev of evaluations) {
                evaluatedJurorIds.add(ev.jurorId);
            }
        }

        // 3. Armar la respuesta
        return team.assignedJurors.map((juror) => {
            const roleName = juror.role?.name ?? '';
            const categoria =
                roleName === 'Profesor' ? 'PROFESOR' : (juror.jurorCategory ?? 'SIN_CATEGORIA');

            return {
                id: juror.id,
                nombre: `${juror.firstName ?? ''} ${juror.lastName ?? ''}`.trim(),
                categoria,
                haEvaluado: evaluatedJurorIds.has(juror.id),
            };
        });
    }
}
