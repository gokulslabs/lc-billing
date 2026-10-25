<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Roles live in `public.user_roles` (enum `app_role`), checked via `has_role()`; never on profiles — avoids privilege escalation.
- First account to sign up becomes admin via the `handle_new_user` trigger; later signups get no role until an admin grants one — keeps the app closed by default.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate); the layout also blocks users without a role.
- The module list in `src/lib/modules.ts` drives the sidebar and dashboard; set `to` when a module ships.
- Password rules live in `src/lib/password.ts` with tests; phone numbers and digit-only passwords are rejected because the old system used them.
