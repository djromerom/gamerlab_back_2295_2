import {
    Injectable,
    NotFoundException,
    InternalServerErrorException,
    Logger,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class ProfessorViewService {
    constructor(private prisma: PrismaService) { }

    async getNRCreport(nrcCode: number) {
        const nrcSubjectSelect = {
            code: true,
            subject: {
                select: {
                    name: true,
                },
            },
        };

        const videogameSelect = {
            name: true,
            evaluations: {
                select: {
                    totalScore: true,
                },
            },
        };

        const teamSelect = {
            teamName: true,
            videogame: {
                select: videogameSelect,
            },
        };

        const memberSelect = {
            firstName: true,
            lastName: true,
            studentCode: true,
            email: true,
            nrcs: {
                select: nrcSubjectSelect,
            },
            team: {
                select: teamSelect,
            },
        };

        const memberWhere = {
            nrcs: {
                some: {
                    code: nrcCode,
                },
            },
        };

        const integrantes = await this.prisma.member.findMany({
            where: memberWhere,
            select: memberSelect,
        });


        if (!integrantes || integrantes.length === 0) {
            throw new NotFoundException(`No students found for NRC with code ${nrcCode}`);
        }

        const curso = integrantes[0].nrcs[0].subject.name;
        const NRC = integrantes[0].nrcs[0].code;

        const reporte = integrantes.map((i) => {
            const videojuego = i.team?.videogame;
            const nota = videojuego?.evaluations?.[0]?.totalScore ?? null;

            return {
                NRC,
                curso,
                estudiante: `${i.firstName} ${i.lastName}`,
                correo: i.email,
                codigo_estudiantil: i.studentCode,
                equipo: i.team?.teamName ?? 'Sin equipo',
                videojuego: videojuego?.name ?? 'Sin videojuego',
                nota,
            };
        });

        return reporte;
    }


    async GetSignatureReport(Subjectname: string) {
        const evaluationSelect = {
            totalScore: true,
        };

        const videogameSelect = {
            name: true,
            evaluations: {
                select: evaluationSelect,
            },
        };

        const teamSelect = {
            teamName: true,
            videogame: {
                select: videogameSelect,
            },
        };

        const memberSelect = {
            firstName: true,
            lastName: true,
            studentCode: true,
            team: {
                select: teamSelect,
            },
        };

        const nrcsSelect = {
            members: {
                select: memberSelect,
            },
        };

        const subjectSelect = {
            name: true,
            nrcs: {
                select: nrcsSelect,
            },
        };

        const subjectWhere = {
            name: Subjectname,
        };

        const subjects = await this.prisma.subject.findMany({
            where: subjectWhere,
            select: subjectSelect,
        });


        if (!subjects) {
            throw new NotFoundException(`Subject ${Subjectname} it is not exist`);
        }

        const reports = [];
        for (const subject of subjects) {
            for (const nrc of subject.nrcs) {
                for (const member of nrc.members) {
                    const videogame = member.team?.videogame;
                    const nota = videogame?.evaluations?.[0]?.totalScore ?? null;

                    reports.push({
                        curso: subject.name,
                        estudiante: `${member.firstName} ${member.lastName}`,
                        codigo_estudiantil: member.studentCode,
                        equipo: member.team?.teamName ?? 'No team',
                        videojuego: videogame?.name ?? 'No videogame',
                        nota
                    });
                }
            }
        }
        return reports;
    }
}