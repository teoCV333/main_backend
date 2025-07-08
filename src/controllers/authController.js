import { registerService, loginService } from '../services/authService.js';


// Register User
export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const response = await registerService(req.body);
    if (!response.data) {
      return res.status(response.error).json({ message: response.errorMessage });
    }
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Login User
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const response = await loginService(req.body)
    if (!response.data) {
      return res.status(response.error).json({ message: response.errorMessage });
    }
    const token = response.data;
    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


export const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokens.includes(refreshToken)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  jwt.verify(refreshToken, process.env.REFRESH_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid refresh token' });

    const newToken = jwt.sign({ id: user.id }, process.env.ACCESS_SECRET, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign({ id: user.id }, process.env.REFRESH_SECRET, { expiresIn: '7d' });

    res.json({ token: newToken, refreshToken: newRefreshToken });
  });
}