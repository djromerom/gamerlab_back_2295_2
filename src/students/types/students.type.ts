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
  teamId: number;
  grade: number;
}