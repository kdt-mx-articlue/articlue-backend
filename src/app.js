require("dotenv").config();

const express = require("express");
const corsMiddleware = require("./config/cors");

const app = express();

// CORS
app.use(corsMiddleware);

// JSON Body Parser
app.use(express.json());

const authRoutes = require('./routes/auth.route');

app.use('/api/auth', authRoutes);
app.use('/api/member', authRoutes);


app.get("/", (req, res) => {
    res.json({
        message: "Server Running",
    });
});

module.exports = app;