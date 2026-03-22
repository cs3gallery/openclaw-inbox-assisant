import { ToolRepository, type ToolEmailSummary } from './repositories/toolRepository';

type ListToolEmailsInput = {
  since?: string;
  limit: number;
  onlyUnresolved: boolean;
  requestedBy?: string;
};

type CreateTodoInput = {
  emailId?: string;
  title: string;
  notes?: string;
  dueDate?: string;
  priority: 'low' | 'normal' | 'high';
  requestedBy: string;
  idempotencyKey?: string;
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

export class ToolService {
  constructor(private readonly toolRepository: ToolRepository) {}

  async getUrgentEmails(input: ListToolEmailsInput): Promise<ToolListResponse> {
    const requestPayload = {
      since: input.since,
      limit: input.limit,
      only_unresolved: input.onlyUnresolved,
      requested_by: input.requestedBy
    };

    try {
      const items = await this.toolRepository.listUrgentEmails(input);
      const response = {
        items,
        meta: {
          count: items.length,
          limit: input.limit,
          ...(input.since ? { since: input.since } : {}),
          onlyUnresolved: input.onlyUnresolved
        }
      };

      await this.toolRepository.recordToolInvocation({
        toolName: 'get_urgent_emails',
        outcome: 'succeeded',
        actorType: 'openclaw',
        actorId: input.requestedBy,
        source: 'openclaw',
        requestPayload,
        responsePayload: response,
        metadata: {
          mode: 'read_only'
        }
      });

      return response;
    } catch (error) {
      await this.toolRepository.recordToolInvocation({
        toolName: 'get_urgent_emails',
        outcome: 'failed',
        actorType: 'openclaw',
        actorId: input.requestedBy,
        source: 'openclaw',
        requestPayload,
        metadata: {
          mode: 'read_only'
        },
        errorCode: 'tool_execution_failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getPendingEmails(input: ListToolEmailsInput): Promise<ToolListResponse> {
    const requestPayload = {
      since: input.since,
      limit: input.limit,
      only_unresolved: input.onlyUnresolved,
      requested_by: input.requestedBy
    };

    try {
      const items = await this.toolRepository.listPendingEmails(input);
      const response = {
        items,
        meta: {
          count: items.length,
          limit: input.limit,
          ...(input.since ? { since: input.since } : {}),
          onlyUnresolved: input.onlyUnresolved
        }
      };

      await this.toolRepository.recordToolInvocation({
        toolName: 'get_pending_emails',
        outcome: 'succeeded',
        actorType: 'openclaw',
        actorId: input.requestedBy,
        source: 'openclaw',
        requestPayload,
        responsePayload: response,
        metadata: {
          mode: 'read_only'
        }
      });

      return response;
    } catch (error) {
      await this.toolRepository.recordToolInvocation({
        toolName: 'get_pending_emails',
        outcome: 'failed',
        actorType: 'openclaw',
        actorId: input.requestedBy,
        source: 'openclaw',
        requestPayload,
        metadata: {
          mode: 'read_only'
        },
        errorCode: 'tool_execution_failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async createTodo(input: CreateTodoInput) {
    try {
      const result = await this.toolRepository.createTodo(input);

      return {
        status: 'queued',
        task_id: result.taskId,
        action_queue_id: result.actionQueueId,
        task_status: result.taskStatus,
        idempotent_replay: result.idempotentReplay
      };
    } catch (error) {
      await this.toolRepository.recordToolInvocation({
        toolName: 'create_todo',
        outcome: 'failed',
        actorType: 'openclaw',
        actorId: input.requestedBy,
        source: 'openclaw',
        emailId: input.emailId,
        idempotencyKey: input.idempotencyKey,
        requestPayload: {
          email_id: input.emailId,
          title: input.title,
          notes: input.notes,
          due_date: input.dueDate,
          priority: input.priority,
          requested_by: input.requestedBy,
          idempotency_key: input.idempotencyKey
        },
        metadata: {
          mode: 'queued_backend_action'
        },
        errorCode: 'tool_execution_failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}
