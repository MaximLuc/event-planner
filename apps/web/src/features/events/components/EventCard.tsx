import { Badge, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { PublicEvent } from "../types";

type EventTypeProps = {
  event: PublicEvent;
};

const policyLabels = {
  OPEN_REGISTRATION: "Свободная запись",
  APPROVAL_REQUIRED: "По заявке",
  INVITE_ONLY: "Только по приглашению",
};

export function EventCard({ event }: EventTypeProps) {
  const dateLabel = event.startsAt
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "long",
        timeZone: event.timezone,
      }).format(new Date(event.startsAt))
    : "Дата уточняется";

  const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: event.timezone,
  });

  const startsAtLabel = event.startsAt
    ? timeFormatter.format(new Date(event.startsAt))
    : "Начало уточняется";

  const endsAtLabel = event.endsAt
    ? timeFormatter.format(new Date(event.endsAt))
    : "Окончание уточняется";

  return (
    <Paper component="article" withBorder p="lg" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Title order={2}>{event.title}</Title>

          <Badge>{policyLabels[event.participationPolicy]}</Badge>
        </Group>

        {event.description && <Text c="dimmed">{event.description}</Text>}

        <Group gap="lg">
          <Text size="sm">Организатор: {event.owner.name}</Text>

          <Text size="sm">
            {event.capacity === null
              ? "Без ограничения участников"
              : `До ${event.capacity} участников`}
          </Text>

          <Text size="sm">
            {dateLabel}  {startsAtLabel} — {endsAtLabel}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}
