import { z } from "zod";
import { GradeSchema, IdSchema, SkillCodeSchema, SubjectIdSchema } from "@/contracts";

export const TEACHER_METRICS_SOURCES = ["fake", "learning"] as const;
export const TeacherMetricsSourceSchema = z.enum(TEACHER_METRICS_SOURCES);
export type TeacherMetricsSource = z.infer<typeof TeacherMetricsSourceSchema>;

const isoDate = z.string().date();
const count = z.number().int().nonnegative();

export const StudentClassMetricsSchema = z.object({
  studentId: IdSchema,
  displayName: z.string().trim().min(1).max(200),
  activityDays: count,
  /** null when the source does not expose access days to this teacher. */
  accessDays: count.nullable(),
  correctAnswers: count,
  incorrectAnswers: count,
  difficultSkillCodes: z.array(SkillCodeSchema),
}).strict();
export type StudentClassMetrics = z.infer<typeof StudentClassMetricsSchema>;

export const SubjectWeekProgressSchema = z.object({
  subjectId: SubjectIdSchema,
  /** Active original activities per student; null when the source does not expose it. */
  activeActivities: count.nullable(),
  answeredOriginals: count.nullable(),
}).strict();
export type SubjectWeekProgress = z.infer<typeof SubjectWeekProgressSchema>;

export const ClassTopStudentSchema = z.object({
  position: z.number().int().min(1).max(10),
  displayName: z.string().trim().min(1).max(200),
  xp: z.number().nonnegative(),
}).strict();
export type ClassTopStudent = z.infer<typeof ClassTopStudentSchema>;

export const ClassMetricsSchema = z.object({
  classId: IdSchema,
  className: z.string().trim().min(1).max(100),
  grade: GradeSchema,
  studentsEnrolled: count,
  students: z.array(StudentClassMetricsSchema),
  subjectProgress: z.array(SubjectWeekProgressSchema),
  topStudents: z.array(ClassTopStudentSchema).max(10),
  notes: z.array(z.string().trim().min(1).max(300)).max(10),
}).strict();
export type ClassMetrics = z.infer<typeof ClassMetricsSchema>;

export const ClassMetricsRequestSchema = z.object({
  institutionId: IdSchema,
  classId: IdSchema,
  subjectIds: z.array(SubjectIdSchema).min(1),
  from: isoDate,
  to: isoDate,
}).strict();
export type ClassMetricsRequest = z.infer<typeof ClassMetricsRequestSchema>;

export type DifficultyScope = "coletiva" | "individual";

export interface SkillDifficulty {
  skillCode: string;
  subjectId: z.infer<typeof SubjectIdSchema>;
  studentCount: number;
  /** Share of students with answers in the period, 0..1. */
  share: number;
  scope: DifficultyScope;
  students: Array<{ studentId: string; displayName: string }>;
}

export type ImprovementReason = "sem_atividade" | "acerto_baixo" | "pouca_atividade";

export interface StudentToImprove {
  studentId: string;
  displayName: string;
  accuracy: number | null;
  answered: number;
  engagedDays: number;
  reasons: ImprovementReason[];
}

export interface EngagementSummary {
  basis: "acesso" | "atividade";
  periodDays: number;
  studentsTotal: number;
  studentsWithActivity: number;
  averageDays: number;
  /** Mean engaged days divided by period days, 0..1. */
  rate: number;
  buckets: { none: number; low: number; regular: number };
}

export interface SubjectProgressView {
  subjectId: z.infer<typeof SubjectIdSchema>;
  subjectName: string;
  answeredOriginals: number | null;
  expectedAnswers: number | null;
  /** 0..1 when both numbers are known. */
  completion: number | null;
}

export interface ClassOverview {
  classId: string;
  className: string;
  grade: z.infer<typeof GradeSchema>;
  studentsEnrolled: number;
  studentsWithData: number;
  subjects: SubjectProgressView[];
  accuracy: number | null;
  engagement: EngagementSummary;
  collectiveDifficulties: SkillDifficulty[];
  individualDifficulties: SkillDifficulty[];
  studentsToImprove: StudentToImprove[];
  topStudents: ClassTopStudent[];
  notes: string[];
}

export interface TeacherOverview {
  source: TeacherMetricsSource;
  period: { from: string; to: string; days: number };
  classes: ClassOverview[];
  /** Classes in scope whose metrics could not be loaded. */
  unavailableClasses: Array<{ classId: string; message: string }>;
  notices: string[];
}
