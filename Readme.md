command
# nohup node server.js > trade.log 2>&1 &

launch aws terminal
# chmod 400 /Users/user/Downloads/Trading2.pem
connect , need to store .pem file in desktop
# ssh -i /Users/user/Desktop/Trading2.pem ubuntu@YOUR_REAL_IP

github authenticated to ec2 using ssh key
github settings

# pm2 start index.js --name backend
# pm2 save

view trades.json
# nano ~/traderobot/src/data/trades.json

update the code and get from github.
# ssh
# cd traderobot
# git pull origin main 

get .env
# nano ~/traderobot/.env


get logs for backend
 # pm2 logs backend

 restart backednd ec2 server
 # pm2 restart backend

 ssh is restricted to source change ssh source in ec2 if not working
 # important

 Restart backend
 # pm2 restart backend

 Recreate scripmaster
# rm -rf scripmaster.json

