import { TaskList } from "@/components/tasks/task-list";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function JiraTasksPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Jira Tasks</CardTitle>
          <CardDescription className="text-lg">
            View and manage tasks that were imported from Jira.
          </CardDescription>
        </CardHeader>
      </Card>
      <TaskList sourceFilter="jira" hideCreate />
    </div>
  );
}

