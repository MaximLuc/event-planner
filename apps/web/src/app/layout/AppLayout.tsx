import {
  AppShell,
  Button,
  Group,
  Stack,
  Title,
  Text,
} from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./AppLayout.module.css";
import { Link, NavLink } from "react-router";

type AppLayoutProps = {
  children: ReactNode;
};

const navigationItems = [
  { label: "Витрина", to: "/events" },
  { label: "Мои события", to: "/my/events" },
  { label: "Моё участие", to: "/my/registrations" },
  { label: "Приглашения", to: "/my/invitations" },
];

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <AppShell
      layout="alt"
      header={{ height: 80 }}
      navbar={{
        width: 104,
        breakpoint: "sm",
        collapsed: { mobile: true },
      }}
      padding="xl"
    >
      <AppShell.Header bg="var(--color-bg)">
        <Group h="100%" px="lg" justify="space-between">
          <Title order={2}>Event Planner</Title>
          <Group gap="sm">
            <Button
              component={Link}
              to="/login"
              variant="subtle"
              color="var(--color-primary)"
            >
              Войти
            </Button>
            <Button
              component={Link}
              to="/my/events/new"
              color="var(--color-primary)"
            >
              Создать событие
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar bg="var(--color-primary)" p="xs">
        <Stack h="100%" justify="space-between">
          <Stack gap="xl">
            <Text
              ta="center"
              fz={32}
              fw={700}
              ff="Oswald Variable, sans-serif"
              c="var(--color-accent)"
            >
              EP
            </Text>
            <Stack gap="xs">
              {navigationItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive
                      ? `${classes.navItem} ${classes.active}`
                      : classes.navItem
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </Stack>
          </Stack>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              isActive
                ? `${classes.navItem} ${classes.active}`
                : classes.navItem
            }
          >
            Профиль
          </NavLink>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
