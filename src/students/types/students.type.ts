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
  grade: number;
}

export class Members {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  studentCode: string;
  nrc: {
    code: string;
  };
