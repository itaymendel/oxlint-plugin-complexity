<script lang="ts">
// @complexity processData:cyclomatic=9,cognitive=12
type Status = 'pending' | 'active' | 'completed' | 'error';

interface Task {
  id: string;
  status: Status;
  priority: number;
  subtasks?: Task[];
}

let tasks: Task[] = [];

function processData(task: Task): string {
  if (task.status === 'error') {
    return 'Failed';
  }

  if (task.status === 'pending') {
    if (task.priority > 5) {
      return 'Urgent pending';
    }
    return 'Waiting';
  }

  if (task.subtasks && task.subtasks.length > 0) {
    for (const subtask of task.subtasks) {
      if (subtask.status !== 'completed') {
        return 'In progress';
      }
    }
    return 'All subtasks done';
  }

  return task.status === 'completed' ? 'Done' : 'Active';
}
</script>

<div>
  {#each tasks as task}
    <div class="task">{processData(task)}</div>
  {/each}
</div>
