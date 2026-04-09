command
# nohup node server.js > trade.log 2>&1 &

frontend api auth
# set FRONTEND_API_AUTH_KEY in .env
# send x-api-key: <FRONTEND_API_AUTH_KEY>
# or Authorization: Bearer <FRONTEND_API_AUTH_KEY>
# GET /api/auth/config to verify backend auth setup

launch aws terminal
# chmod 400 /Users/user/Downloads/Trading2.pem
connect 
# ssh -i /Users/user/Downloads/Trading2.pem ubuntu@YOUR_REAL_IP

github authenticated to ec2 using ssh key
github settings

# pm2 start index.js --name backend
# pm2 save

view trades.json
# nano ~/traderobot/src/data/trades.json
