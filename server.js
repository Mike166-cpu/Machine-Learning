const express = require('express');
const cors = require('cors'); // Import the cors package
const app = express();
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: 'http://localhost:3000',  origin: [
    'http://localhost:3000',
    'https://hr1.jjm-manufacturing.com' // Add your frontend URL when deployed
  ],  methods: 'GET, POST', 
  allowedHeaders: 'Content-Type, Authorization', 
};

app.use(cors(corsOptions)); 
const timeTrackingRoutes = require('./routes/timeTracking');

app.use(express.json());

app.get('/api/hello', (req, res) => {
  res.send('Hello from backend!');
});

app.use("/api", timeTrackingRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
