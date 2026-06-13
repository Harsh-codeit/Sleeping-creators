import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import ClientDetail from "./ClientDetail";

jest.mock("axios");

// Avoid pulling in react-router v7 (needs TextEncoder polyfill in jsdom).
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "c1" }),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ search: "", pathname: "/clients/c1" }),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

// Silence sonner toast portal noise
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// Email rendering deps pull TextEncoder/TextDecoder (not in jsdom); not on our path.
jest.mock("@react-email/render", () => ({ render: jest.fn() }));
jest.mock("../emails/ContentStrategyOnboardingEmail", () => ({
  ContentStrategyOnboardingEmail: () => null,
}));

function renderAt() {
  return render(<ClientDetail />);
}

const baseClient = (onboarding) => ({
  id: "c1",
  name: "Acme Corp",
  avatar: "AC",
  status: "active",
  platforms: ["instagram"],
  posts_today: 0,
  posts_total: 0,
  onboarding_data: onboarding,
});

const modernOnboarding = {
  competitor_accounts: ["@rival"],
  not_to_do_list: ["no politics"],
  solutions_provided: ["coaching"],
  audience_problems: ["stuck"],
  audience_desires: ["growth"],
  audience_myths: ["post daily"],
  audience_failed_attempts: ["hacks"],
  unique_selling_points: ["framework"],
  frequent_questions: ["how"],
  love_topics: ["fitness"],
  audience_emotional_state: ["Ambitious"],
  brand_vibe: ["Professional"],
  language: ["English"],
};

// Legacy doc: list fields stored as comma/newline STRINGS (pre-array era)
const legacyOnboarding = {
  competitor_accounts: "@rival, @other",
  not_to_do_list: "no politics\nno pricing",
  solutions_provided: "coaching",
  love_topics: "fitness, mindset",
  audience_emotional_state: "Ambitious",
  brand_vibe: "Professional",
  language: "English",
};

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockImplementation((url) => {
    if (url.includes("/posts")) return Promise.resolve({ data: [] });
    if (url.includes("/analytics/")) return Promise.resolve({ data: {} });
    if (url.includes("/emails")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: globalThis.__CLIENT__ });
  });
});

async function gotoProfileAndSave(savedClient) {
  await screen.findByTestId("client-detail-page");
  fireEvent.click(screen.getByTestId("tab-profile"));
  await screen.findByTestId("edit-profile-tab");
  axios.put.mockResolvedValue({ data: savedClient });
  fireEvent.click(screen.getByTestId("save-edit-btn"));
  // let the async save + re-render flush
  await waitFor(() => expect(axios.put).toHaveBeenCalled());
}

test("A: modern client (arrays) — open Profile + save does not crash", async () => {
  globalThis.__CLIENT__ = baseClient(modernOnboarding);
  renderAt();
  await gotoProfileAndSave(baseClient(modernOnboarding));
  expect(screen.getByTestId("edit-profile-tab")).toBeInTheDocument();
});

test("B: legacy client (string list fields) — open Profile + save does not blank", async () => {
  globalThis.__CLIENT__ = baseClient(legacyOnboarding);
  renderAt();
  // Backend echoes the saved doc; simulate it normalising to arrays.
  await gotoProfileAndSave(
    baseClient({ ...legacyOnboarding, competitor_accounts: ["@rival", "@other"] })
  );
  // Page is still alive (not unmounted by an uncaught render error).
  expect(screen.getByTestId("edit-profile-tab")).toBeInTheDocument();
});

test("C: Competitors tab with legacy string competitor_accounts does not blank", async () => {
  globalThis.__CLIENT__ = baseClient(legacyOnboarding);
  renderAt();
  await screen.findByTestId("client-detail-page");
  fireEvent.click(screen.getByTestId("tab-competitors"));
  // CompetitorTab + the onboarding chips render without throwing.
  expect(screen.getByTestId("client-detail-page")).toBeInTheDocument();
});
