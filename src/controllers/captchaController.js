export const validateCaptcha = (res, req) => {
    
app.post('/api/contact', async (req, res) => {
  const { token } = req.body;
  const turnstile = new Turnstile('0x4AAAAAABlmdIZnd7d79URkKnCKFedbEUo');
  const result = await turnstile.verify(token);
  
  if (!result.success) {
    return res.status(400).send({ error: 'CAPTCHA inválido' });
  }
  
});
}