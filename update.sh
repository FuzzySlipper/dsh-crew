cd /home/dev/dsh-crew/research/deepseek-harness

git status --short --branch
git pull --ff-only
pnpm install

systemctl --user stop dsh-web.service
pnpm run clean
pnpm run build
systemctl --user start dsh-web.service