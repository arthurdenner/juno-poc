const axios = require('axios');
const chalk = require('chalk');
const express = require('express');
const faker = require('faker-br');

// Credit card for recurrent payments
let creditCardId = null;
// setInterval number
let intervalId = null;

const JUNO_BASE_URL = 'https://sandbox.boletobancario.com';
const JUNO_PRIVATE_KEY =
  '1B2023512AE996041F15929BCB0E3DE1E9563105BA8B1F1511FF3A675032B48E';
// Cll0e074SanANu5L:[&fj}mz0R?c!tZ%Gw4_IEYG8lcS2>gwe in base64
const JUNO_CREDENTIALS =
  'Q2xsMGUwNzRTYW5BTnU1TDpbJmZqfW16MFI/YyF0WiVHdzRfSUVZRzhsY1MyPmd3ZQ==';

const app = express();
const client = axios.create({
  baseURL: JUNO_BASE_URL,
  headers: {
    'X-Api-Version': 2,
  },
});

client.interceptors.response.use(({ data }) => data);

const getBilling = () => {
  const firstName = faker.name.firstName();
  const lastName = faker.name.lastName();

  return {
    name: `${firstName} ${lastName}`,
    document: faker.br.cpf(),
    email: faker.internet
      .email(firstName.toLowerCase(), lastName.toLowerCase(), 'gmail.com')
      .replace(/[\d_]/g, ''),
    address: {
      street: faker.address.streetAddress(),
      number: faker.random.number(),
      city: 'Maceió',
      state: 'AL',
      postCode: '49052335',
    },
  };
};

const getCharge = () => ({
  amount: faker.finance.amount(),
  description: 'Pagamento único',
  paymentTypes: ['CREDIT_CARD'],
});

const getCredentials = async () =>
  client.post(
    '/authorization-server/oauth/token',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${JUNO_CREDENTIALS}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

const createCharge = ({ accessToken, billing, charge }) =>
  client.post(
    '/api-integration/charges',
    { billing, charge },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Resource-Token': JUNO_PRIVATE_KEY,
      },
    }
  );

const performPayment = ({
  accessToken,
  billing,
  chargeId,
  creditCardDetails,
  delayed,
}) =>
  client.post(
    '/api-integration/payments',
    {
      chargeId,
      billing: {
        delayed,
        address: billing.address,
        email: billing.email,
      },
      creditCardDetails,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Resource-Token': JUNO_PRIVATE_KEY,
      },
    }
  );

const performRecurrentPayment = async ({ billing, charge, delayed }) => {
  // Get credentials for request
  const credentials = await getCredentials();
  const { access_token: accessToken } = credentials;
  // Create new charge
  const newCharge = await createCharge({ accessToken, billing, charge });
  const { charges } = newCharge._embedded;

  // Perform payment for each charge (only one in this case)
  const payments = await Promise.all(
    charges.map(({ id }) =>
      performPayment({
        accessToken,
        billing,
        chargeId: id,
        delayed,
        creditCardDetails: {
          // !Use tokenized id instead of hash
          creditCardId,
        },
      })
    )
  );

  console.log(chalk.green('Recurrent payment done'));
  console.log(payments);
};

const tokenizeCard = ({ accessToken, creditCardHash }) =>
  client.post(
    '/api-integration/credit-cards/tokenization',
    { creditCardHash },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Resource-Token': JUNO_PRIVATE_KEY,
      },
    }
  );

app.post('/pay-once', async (req, res) => {
  try {
    // Extract URL params
    const { confirmed, creditCardHash } = req.query;
    // Get credentials for request
    const credentials = await getCredentials();
    const { access_token: accessToken } = credentials;
    // Generate data
    const billing = getBilling();
    const charge = getCharge();
    // Create new charge
    const newCharge = await createCharge({ accessToken, billing, charge });
    const { charges } = newCharge._embedded;
    // Perform payment for each charge (only one in this case)
    const payments = await Promise.all(
      charges.map(({ id }) =>
        performPayment({
          accessToken,
          billing,
          chargeId: id,
          delayed: confirmed === 'false',
          creditCardDetails: {
            // !Use hash generate in the front
            creditCardHash,
          },
        })
      )
    );

    console.log(chalk.green('Single payment done'));
    res.status(200).send(payments);
  } catch (err) {
    console.error(chalk.red('Single payment error'));
    console.error(err);
    res.status(500).send(err);
  }
});

app.post('/pay-recurrent', async (req, res) => {
  try {
    if (intervalId) {
      console.log('Cancelling recurrent payment');
      clearInterval(intervalId);
      intervalId = null;
    }

    // Extract URL params
    const { confirmed, creditCardHash } = req.query;
    // Get credentials for request
    const credentials = await getCredentials();
    const { access_token: accessToken } = credentials;

    // Tokenized if no card is stored
    if (!creditCardId) {
      const tokenizedCard = await tokenizeCard({ accessToken, creditCardHash });
      console.log(tokenizedCard);
      creditCardId = tokenizedCard.creditCardId;
    }

    // Generate data
    const billing = getBilling();
    const charge = getCharge();

    // Trigger recurrent payment each 5 seconds
    intervalId = setInterval(() => {
      performRecurrentPayment({
        billing,
        charge,
        delayed: confirmed === 'false',
      });
    }, 5000);

    console.log(chalk.green('Recurrent payment triggered'));
    res.status(200).json({ billing, charge });
  } catch (err) {
    console.error(chalk.red('Recurrent payment error'));
    console.error(err);
    res.status(500).send(err);
  }
});

app.post('/stop-recurrence', (_, res) => {
  if (!intervalId) {
    console.log('No recurrent payment on going');
    res.status(404).end();
    return;
  }

  console.log('Cancelling recurrent payment');
  clearInterval(intervalId);
  intervalId = null;
  res.status(200).end();
});

app.use('*', express.static('public'));

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
