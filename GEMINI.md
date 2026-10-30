# Project Guidelines & Rules

## Automatic Git Commit & Push Rule
- **Mandatory Workflow**: After completing any code, documentation, or configuration change in this project, the agent must automatically:
  1. Review `git status` to ensure only intended project files are staged.
  2. Stage the changes (`git add`).
  3. Create a clear, descriptive commit message in Persian or English explaining the changes made (`git commit -m "..."`).
  4. Push the commit to the remote repository on GitHub (`git push origin main`).
- **Confirmation**: After pushing, report the commit message and push status to the user.
