import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggleSwitch } from "@/components/settings/theme-toggle-switch";
import { MondayConnect } from "@/components/settings/monday-connect";
import { JiraConnect } from "@/components/settings/jira-connect";
import { HarvestConnect } from "@/components/settings/harvest-connect";

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Settings</CardTitle>
          <CardDescription className="text-lg">
            Customize your Axon experience.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Adjust the look and feel of the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ThemeToggleSwitch />
        </CardContent>
      </Card>

      <MondayConnect />
      <JiraConnect />
      <HarvestConnect returnTo="/settings" />
    </div>
  );
}
