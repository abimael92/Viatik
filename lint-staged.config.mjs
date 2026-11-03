/**
 * Staged-file gate, run by `.husky/pre-commit`.
 *
 * `pnpm lint` and `pnpm typecheck` still run after this, repo-wide — lint-staged
 * only adds fast feedback on the files being committed and keeps a stray
 * `--fix`able problem from reaching the tree.
 *
 * `tsc --noEmit` ignores file arguments and always checks the whole project, so
 * it is not repeated here; the pre-commit hook runs it once.
 */
const config = {
  "*.{js,jsx,mjs,cjs,ts,tsx}": ["eslint --max-warnings 0"],
};

export default config;
