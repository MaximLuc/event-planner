import type { PublicEvent } from './types'

export const mockEvents: PublicEvent[] = [
  {
    title: 'Вечер настольных игр',
    slug: 'board-games-evening-a7k2',
    description:
      'Собираемся играть в любимые настолки и знакомиться с новыми людьми. Можно прийти без компании — правила объясним на месте.',
    startsAt: '2026-10-31T16:00:00.000Z',
    endsAt: '2026-10-31T19:00:00.000Z',
    timezone: 'Europe/Moscow',
    capacity: 12,
    participationPolicy: 'OPEN_REGISTRATION',
    owner: {
      name: 'Алексей Крылов',
    },
  },
  {
    title: 'Книжный клуб',
    slug: 'book-club-m4p8',
    description:
      'Читаем, обсуждаем и делимся впечатлениями. На этот раз — современная проза. Подай заявку и расскажи, какую книгу ты недавно прочитал.',
    startsAt: '2026-11-01T15:30:00.000Z',
    endsAt: '2026-11-01T18:00:00.000Z',
    timezone: 'Europe/Moscow',
    capacity: 10,
    participationPolicy: 'APPROVAL_REQUIRED',
    owner: {
      name: 'Мария Смирнова',
    },
  },
  {
    title: 'Встреча организаторов небольших мероприятий',
    slug: 'organizers-meetup-r9v3',
    description: null,
    startsAt: '2026-11-07T10:00:00.000Z',
    endsAt: '2026-11-07T12:00:00.000Z',
    timezone: 'Europe/Moscow',
    capacity: null,
    participationPolicy: 'INVITE_ONLY',
    owner: {
      name: 'Илья Соколов',
    },
  },
]
