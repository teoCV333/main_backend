import axios from "axios";

export const validateBankService = async (bin) => {

  try {
    const response = await axios.get(`https://lookup.binlist.net/${bin}`);

    const { scheme, type, brand, country, bank } = response.data;

    const result = {
      scheme,
      type,
      brand,
      country: {
        name: country?.name,
        code: country?.alpha2,
        currency: country?.currency,
        emoji: country?.emoji,
      },
      bank: {
        name: bank?.name,
      },
    };

    return {
        success: true,
        data: result
    }
  } catch (error) {
    return {
        success: false,
        error: 500,
        errorMessage: `error in bank validation: ${error}`
    }
  }
};

