import { setTimeout as delay } from 'node:timers/promises';

type MailpitAddress = {
  Name: string;
  Address: string;
};

export type MailpitMessage = {
  ID: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  Subject: string;
};

type MailpitMessages = {
  total: number;
  messages: MailpitMessage[];
};

export type MailpitMessageDetails = MailpitMessage & {
  Text: string;
};

async function mailpitRequest(path: string, method = 'GET'): Promise<Response> {
  const baseUrl = process.env.MAILPIT_API_URL;

  // Never fall back to the developer's mailbox on localhost:8025.
  if (process.env.NODE_ENV !== 'test' || !baseUrl) {
    throw new Error('Mailpit helpers require the isolated e2e environment');
  }

  const response = await fetch(new URL(path, baseUrl), {
    method,
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Mailpit ${method} ${path} returned ${response.status}`);
  }

  return response;
}

export async function clearMailpit(): Promise<void> {
  await mailpitRequest('/api/v1/messages', 'DELETE');
}

export async function getMailpitMessages(): Promise<MailpitMessages> {
  const response = await mailpitRequest('/api/v1/messages');
  return (await response.json()) as MailpitMessages;
}

export async function getMailpitMessage(
  id: string,
): Promise<MailpitMessageDetails> {
  const response = await mailpitRequest(
    `/api/v1/message/${encodeURIComponent(id)}`,
  );
  return (await response.json()) as MailpitMessageDetails;
}

export async function waitForMailpitMessages(
  expectedCount: number,
): Promise<MailpitMessage[]> {
  const deadline = Date.now() + 5_000;
  let total = 0;

  do {
    const mailbox = await getMailpitMessages();
    total = mailbox.total;

    if (total === expectedCount) {
      return mailbox.messages;
    }

    if (total > expectedCount) {
      break;
    }

    await delay(25);
  } while (Date.now() < deadline);

  throw new Error(
    `Expected ${expectedCount} Mailpit messages, received ${total}`,
  );
}
