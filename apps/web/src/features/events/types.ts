type ParticipationPolicy = 
  | 'OPEN_REGISTRATION'
  | 'APPROVAL_REQUIRED'
  | 'INVITE_ONLY'

export type PublicEvent = {
  title: string,
  slug: string,
  timezone: string,
  description: string | null,
  startsAt: string | null,
  endsAt: string | null,
  capacity: number | null,
  participationPolicy: ParticipationPolicy,
  owner: {
    name: string
  }
}
