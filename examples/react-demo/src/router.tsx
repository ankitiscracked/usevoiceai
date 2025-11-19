import {
  Link,
  Outlet,
  RootRoute,
  Route,
  RouterProvider,
  createRouter,
} from "@tanstack/react-router";
import { HomePage } from "./pages/HomePage";
import { ManualExamplePage } from "./pages/ManualExamplePage";
import { AutoExamplePage } from "./pages/AutoExamplePage";
import "./index.css";

const RootLayout = () => (
  <div className="min-h-screen bg-stone-50 text-stone-900">
    <header className="border-b border-stone-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="text-xl font-semibold text-stone-900">
          usevoice demo
        </Link>
        <nav className="flex gap-4 text-sm text-stone-600">
          <Link to="/manual" className="hover:text-stone-900">
            Manual
          </Link>
          <Link to="/auto" className="hover:text-stone-900">
            Hands-free
          </Link>
        </nav>
      </div>
    </header>
    <main className="max-w-6xl mx-auto px-6 py-10">
      <Outlet />
    </main>
  </div>
);

const rootRoute = new RootRoute({
  component: RootLayout,
});

const homeRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const manualRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/manual",
  component: ManualExamplePage,
});

const autoRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/auto",
  component: AutoExamplePage,
});

const routeTree = rootRoute.addChildren([homeRoute, manualRoute, autoRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
