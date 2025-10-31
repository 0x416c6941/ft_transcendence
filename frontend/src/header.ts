// src/ui/header.ts
import { auth } from "./auth.js";
import Router from "./router.js";

export function mountHeader(router: Router) {
  const $login = document.getElementById("btn-login");
  const $register = document.getElementById("btn-register");
  const $profile = document.getElementById("btn-profile");
  const $friends = document.getElementById("btn-friends");
  const $stats = document.getElementById("btn-stats");
  const $logout = document.getElementById("btn-logout") as HTMLButtonElement | null;

  if (!$login || !$register || !$profile || !$logout || !$friends || !$stats) return () => {};

  void auth.bootstrap();

  const render = (s = auth.get()) => {
    const loggedIn = s.status === "authenticated";
    $login.hidden = loggedIn;
    $register.hidden = loggedIn;
    $profile.hidden = !loggedIn;
    $logout.hidden = !loggedIn;
    $friends.hidden = !loggedIn;
    $stats.hidden = !loggedIn;
  };

  // initial paint
  render();

  // keep UI in sync
  const unsubscribe = auth.subscribe(render);

  // nav handlers
  $login.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/login");
  });
  $register.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/register");
  });
  $profile.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/profile");
  });
  $friends.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/friends");
  });
  $stats.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/stats");
  });

  // logout flow
  const onLogout = async (e: Event) => {
    e.preventDefault();
    $logout.disabled = true;
    const prev = $logout.textContent;
    $logout.textContent = "Logging out…";
    try {
      await auth.signOut();
      router.navigate("/login");
    } finally {
      $logout.disabled = false;
      $logout.textContent = prev || "Logout";
    }
  };
  $logout.addEventListener("click", onLogout);


  return () => {
    unsubscribe?.();
    $logout.removeEventListener("click", onLogout);
  };
}
