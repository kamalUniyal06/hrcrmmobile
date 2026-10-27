// Candidate journey helpers: application stage tracker and filters, and the interview journey.
// Ports of the web app's pages/candidate/candidateStatus.js, pages/jobs/JobsPage.jsx (filters)
// and pages/interviews/candidateInterviewData.js.
import { applicationStage, candidateInterviewStatus, nextInterview } from "../api/candidate.api";
import { interviewDate } from "./dates";

const clean = (value) => String(value ?? "").trim();

export const applicationStages = ["Applied", "Review", "Interview", "Decision"];

/** One entry per stage, so a list row and the detail tracker draw the same steps. */
export function applicationSteps(status) {
  const stage = applicationStage(status);
  return applicationStages.map((label, index) => ({
    label,
    state: index < stage.index || (stage.closed && index === stage.index) ? "done" : index === stage.index ? "current" : "upcoming",
    tone: index === stage.index ? stage.tone : "progress",
  }));
}

/** What each stage means for this application (web JobDetailsDrawer ApplicationProgress). */
export function applicationStepDetails(status, appliedOn = "") {
  const steps = applicationSteps(status);
  const current = steps.findIndex((step) => step.state === "current");
  return {
    Applied: appliedOn ? `Submitted ${appliedOn}` : "Submitted with your candidate profile",
    Review: current === 1 ? "A recruiter is reviewing your profile." : current > 1 || current === -1 ? "Your profile was reviewed." : "After you apply.",
    Interview: current === 2 ? "You're at the interview stage." : current > 2 || current === -1 ? "Interview stage complete." : "Scheduled after review.",
    Decision: steps[3].state === "done" ? (steps[3].tone === "closed" ? "This application is closed." : "Congratulations, HR will be in touch.") : "We'll share the outcome here.",
  };
}

/** My applications filters; each one is also a summary count. */
export const applicationFilters = {
  all: { label: "All", test: () => true },
  active: { label: "Active", test: (stage) => !stage.closed },
  interviews: { label: "In interviews", test: (stage) => !stage.closed && stage.index >= 2 },
  closed: { label: "Closed", test: (stage) => stage.closed },
};

export function countApplications(applications = []) {
  const stages = applications.map((record) => applicationStage(record.status));
  return Object.fromEntries(Object.entries(applicationFilters).map(([key, filter]) => [key, stages.filter(filter.test).length]));
}

export const appliedOn = (application) => clean(application?.date_entered_uni_format || application?.date_entered);

// ─── Interviews ───────────────────────────────────────────────────────────────

export const isFirstRound = (round) => /^round\s*1$/i.test(clean(round).replace(/\s+/g, " "));

/** Rounds with status and date, the next scheduled one, and how many are complete. */
export function interviewJourney(interviews = [], now = Date.now()) {
  const next = nextInterview(interviews, now);
  const rounds = interviews.map((record) => ({
    record,
    date: interviewDate(record.scheduledAt),
    status: candidateInterviewStatus({ interview_status: record.status, interview_datetime: record.scheduledAt }, now),
    upNext: record.id === next?.record.id,
  }));
  return { rounds, next, completed: rounds.filter((round) => ["passed", "completed"].includes(round.status.key)).length };
}
