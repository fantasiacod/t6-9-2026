@echo off
cd /d "%~dp0"
REM Never ship .env (Supabase service_role key), node_modules, or _archive.
tar.exe -a -c -f "..\enterprise-task-system-deploy.zip" ^
  --exclude=.env ^
  --exclude=node_modules ^
  --exclude=_archive ^
  --exclude=*.zip ^
  *
echo Done! (.env, node_modules and _archive excluded)
