export * from "./domain/model";
export * from "./domain/aggregate";
export * from "./domain/period";
export * from "./domain/scope";
export * from "./ports";
export { createFakeTeacherMetricsGateway, FAKE_METRICS_NOTE } from "./adapters/fake";
export { createLearningTeacherMetricsGateway, type ClassRoster, type ClassRosterSource, type LearningJsonFetch } from "./adapters/learning";
export { composeTeacherOverview } from "./server/compose-overview";
