type ToolEmailSummary = {
  emailId: string;
  senderName?: string;
  senderEmail: string;
  subject: string;
  receivedAt?: string;
  category: string;
  urgency: string;
  emergencyScore: number;
  needsReply: boolean;
  taskLikelihood: number;
  confidence: number;
  shortSummary?: string;
};

type ToolListResponse = {
  items: ToolEmailSummary[];
  meta: {
    count: number;
    limit: number;
    since?: string;
    onlyUnresolved: boolean;
  };
};

type CreateTodoResponse = {
  status: string;
  task_id: string;
  action_queue_id: string;
  task_status: string;
  idempotent_replay: boolean;
};

function renderEmailLine(item: ToolEmailSummary, index: number): string {
  const sender = item.senderName ?? item.senderEmail;
  const summary = item.shortSummary ? ` - ${item.shortSummary}` : "";
  return `${index + 1}. ${item.subject} (${sender}, ${item.urgency})${summary}`;
}

export function formatUrgentEmailsResponse(payload: ToolListResponse): string {
  if (payload.items.length === 0) {
    return "No urgent emails were found.";
  }

  const lines = payload.items.slice(0, 5).map(renderEmailLine);
  return [`Found ${payload.items.length} urgent emails.`, ...lines].join("\n");
}

export function formatPendingEmailsResponse(payload: ToolListResponse): string {
  if (payload.items.length === 0) {
    return "No pending or reply-needed emails were found.";
  }

  const lines = payload.items.slice(0, 5).map(renderEmailLine);
  return [`Found ${payload.items.length} pending emails that likely need reply or action.`, ...lines].join(
    "\n",
  );
}

export function formatCreateTodoResponse(payload: CreateTodoResponse): string {
  if (payload.idempotent_replay) {
    return `Todo already exists and was reused. Task ${payload.task_id} remains ${payload.task_status}.`;
  }

  return `Queued todo ${payload.task_id} with status ${payload.task_status}.`;
}
