/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, Type} from '@google/genai';

// --- DOM Element Selection ---
const wordInput = document.getElementById('wordInput') as HTMLInputElement;
const generateButton = document.getElementById(
  'generateButton',
) as HTMLButtonElement;
const resultContainer = document.getElementById(
  'resultContainer',
) as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const loadingMessage = document.getElementById(
  'loadingMessage',
) as HTMLDivElement;
const exampleButtons = document.querySelectorAll('.example-btn');


// --- Gemini API Initialization ---
// IMPORTANT: The API key is sourced from the `process.env` object.
// This is a secure practice and assumes the key is set in the deployment environment.
// Do not hardcode the API key here.
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// --- UI Helper Functions ---
function setLoading(isLoading: boolean, message = '') {
  generateButton.disabled = isLoading;
  if (isLoading) {
    loadingMessage.innerHTML = `<div class="spinner"></div> <span>${message}</span>`;
    errorMessage.textContent = '';
    resultContainer.innerHTML = '';
  } else {
    loadingMessage.innerHTML = '';
  }
}

function displayError(message: string) {
  errorMessage.textContent = message;
  resultContainer.innerHTML = '';
}

interface CardData {
  imageUrl: string;
  arabicWord: string;
  englishTranslation: string;
}

function displayResult(cards: CardData[]) {
  let cardsHtml = '';
  for (const card of cards) {
    cardsHtml += `
      <div class="flashcard-container">
          <div class="flashcard" role="button" tabindex="0" aria-label="Flashcard showing an image of ${card.englishTranslation}. Click or press Enter to flip for the word and translation.">
              <div class="flashcard-front">
                  <img src="${card.imageUrl}" alt="A visual representation of ${card.englishTranslation}." class="result-image">
                  <div class="flip-instruction">Click to flip</div>
              </div>
              <div class="flashcard-back">
                  <div class="arabic-word">${card.arabicWord}</div>
                  <div class="english-translation">${card.englishTranslation}</div>
              </div>
          </div>
      </div>
    `;
  }

  resultContainer.innerHTML = `<div class="flashcard-grid">${cardsHtml}</div>`;
  const grid = resultContainer.querySelector('.flashcard-grid');

  if (cards.length === 1 && grid) {
    grid.classList.add('single-card');
  }

  const flashcards = resultContainer.querySelectorAll('.flashcard');
  flashcards.forEach((flashcard) => {
    const flipCard = () => flashcard.classList.toggle('is-flipped');
    flashcard.addEventListener('click', flipCard);
    flashcard.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        flipCard();
      }
    });
  });
}

// --- Main Event Listener ---
generateButton.addEventListener('click', async () => {
  const arabicWord = wordInput.value.trim();
  if (!arabicWord) {
    displayError('Please enter an Arabic word or category.');
    return;
  }

  setLoading(true, 'Analyzing your request...');

  try {
    // Step 1: Intelligently analyze input and get data for 1 or 4 cards
    const analysisPrompt = `Analyze the user's Arabic input: "${arabicWord}". Determine if it represents a single, specific concept (e.g., "قطة" - cat, "سعيد" - happy) or a broader category (e.g., "حيوانات بحرية" - sea animals, "فواكه" - fruits).
- If it's a single concept, return a JSON object containing a 'cards' array with ONE element for that concept.
- If it's a category, return a JSON object containing a 'cards' array with FOUR elements: one general card for the category and three specific examples.
Each element in the 'cards' array must have these properties: "arabic" (the Arabic word), "english" (the English translation), and "imagePrompt" (a simple, photographic, family-friendly image prompt in English).`;

    const analysisResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: analysisPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              description:
                'An array of 1 or 4 card objects, depending on if the input is a single item or a category.',
              items: {
                type: Type.OBJECT,
                properties: {
                  arabic: {
                    type: Type.STRING,
                    description: 'The related Arabic word.',
                  },
                  english: {
                    type: Type.STRING,
                    description:
                      'The English translation of the related word.',
                  },
                  imagePrompt: {
                    type: Type.STRING,
                    description:
                      'A simple, photographic image prompt for the related word.',
                  },
                },
                required: ['arabic', 'english', 'imagePrompt'],
              },
            },
          },
          required: ['cards'],
        },
      },
    });

    const responseJson = JSON.parse(analysisResponse.text);
    const wordDataArray = responseJson.cards;

    if (!wordDataArray || wordDataArray.length === 0) {
      throw new Error('Could not get valid data from the model.');
    }

    const imageCount = wordDataArray.length;
    setLoading(
      true,
      `Generating ${imageCount} image(s) (this may take a moment)...`,
    );

    // Step 2: Generate all images in parallel
    const imagePromises = wordDataArray.map(
      (word: {imagePrompt: string}) =>
        ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: word.imagePrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '1:1',
          },
        }),
    );

    const imageResponses = await Promise.all(imagePromises);

    const cardsData: CardData[] = imageResponses.map((response, index) => {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
      return {
        imageUrl,
        arabicWord: wordDataArray[index].arabic,
        englishTranslation: wordDataArray[index].english,
      };
    });

    // Step 3: Display the results
    displayResult(cardsData);
  } catch (error: unknown) {
    console.error('Error during generation:', error);
    const detailedError =
      (error as Error)?.message || 'An unknown error occurred';
    displayError(
      `An error occurred. Please try again. Details: ${detailedError}`,
    );
  } finally {
    setLoading(false);
  }
});

wordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    generateButton.click();
  }
});

exampleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const value = (button as HTMLButtonElement).dataset.value;
    if (value) {
      wordInput.value = value;
      generateButton.click();
      wordInput.focus();
    }
  });
});
