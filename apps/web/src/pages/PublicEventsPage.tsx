import { Stack, Title } from "@mantine/core";
import { mockEvents } from "../features/events/mock-events";
import { EventCard } from "../features/events/components/EventCard";

export default function PublicEventsPage() {
  return (
    <Stack gap="lg">
      <Title>Мероприятия</Title>

      {mockEvents.map((event) => (
        <EventCard key={event.slug} event={event} />
      ))}
    </Stack>
  );
}
