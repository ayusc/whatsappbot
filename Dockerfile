FROM node:20

WORKDIR /wahbuddy

RUN npm install --omit=dev --legacy-peer-deps

COPY . .

EXPOSE 8000 # uncomment this line if not using web process

CMD ["node", "main.js"]
