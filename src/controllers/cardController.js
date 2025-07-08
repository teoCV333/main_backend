import { validateBankService } from '../services/cardService.js';


// Register User
export const validateBank = async (req, res) => {
  try {
    const bin = req.params.bin;
    const response = await validateBankService(bin);
    if (!response.data) {
      return res.status(response.error).json({ message: response.errorMessage });
    }
    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
