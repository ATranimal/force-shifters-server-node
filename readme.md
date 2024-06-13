### running locally

```
npm install
npm run dev
```

### updating server

this is hosted on a digital ocean droplet running pm2

- logon to droplet as admin
- go to usr/force-shifters-server-node from root
- `git pull`
- `pm2 restart 0`
