import "./App.css";
import { AppLayout } from "./app/layout/AppLayout";
import { Navigate, Route, Routes } from "react-router";
import PublicEventsPage from "./pages/PublicEventsPage";
import MyRegistrationsPage from "./pages/MyRegistrationsPage";
import MyEventsPage from "./pages/MyEventsPage";
import MyInvitationsPage from "./pages/MyInvitationsPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import CreateEventPage from "./pages/CreateEventPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/events" replace />} />
        <Route path="/events" element={<PublicEventsPage />} />
        <Route path="/my/events" element={<MyEventsPage />} />
        <Route path="/my/registrations" element={<MyRegistrationsPage />} />
        <Route path="/my/invitations" element={<MyInvitationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/my/events/new" element={<CreateEventPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
