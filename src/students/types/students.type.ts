import { Member } from "@prisma/client";

export class StudentsEvaluations {
  evaluationId: number;
  evaluationDate: Date;
  evaluationComment: string | null;
  evaluationScore: number | null;
  evaluationDetails: {
    score: number;
    criterionId: number;
    criterionName: string;
    criterionWeight: number | null;
  }[];
}

export class StudentsGrade {
  // HU-34: nota final (cálculo único); null = «Nota en proceso»
  grade: number | null;
}
