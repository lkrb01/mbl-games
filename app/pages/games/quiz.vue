<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/games" class="back">← Back</NuxtLink>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span v-if="phase === 'playing'" class="progress-label">{{ current + 1 }} / {{ questions.length }}</span>
      </div>
    </nav>

    <Transition name="slide" mode="out-in">

      <!-- ── Category selection ── -->
      <div v-if="phase === 'setup'" key="setup" class="setup-card">
        <h2 class="setup-title">Choose a Category</h2>
        <p class="setup-sub">10 questions picked at random each round</p>

        <button class="mixed-btn" @click="startQuiz(null)">
          🎲 Mixed — All Categories
        </button>

        <div class="cat-grid">
          <button
            v-for="cat in CATEGORIES"
            :key="cat.id"
            class="cat-btn"
            :style="{ '--c': cat.color }"
            @click="startQuiz(cat.id)"
          >
            <span class="cat-icon">{{ cat.icon }}</span>
            <span class="cat-name">{{ cat.id }}</span>
            <span class="cat-count">{{ countFor(cat.id) }} questions</span>
          </button>
        </div>
      </div>

      <!-- ── Quiz in progress ── -->
      <div v-else-if="phase === 'playing'" :key="`q${current}`" class="quiz-card">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${((current + 1) / questions.length) * 100}%` }" />
        </div>

        <p class="category">{{ q.category }}</p>
        <h2 class="question">{{ q.question }}</h2>

        <div class="options">
          <button
            v-for="(opt, i) in q.options"
            :key="i"
            class="option"
            :class="optionClass(i)"
            :disabled="answered"
            @click="answer(i)"
          >
            <span class="option-letter">{{ letters[i] }}</span>
            {{ opt }}
          </button>
        </div>

        <button v-if="answered" class="next-btn" @click="next">
          {{ current < questions.length - 1 ? 'Next Question →' : 'See Results →' }}
        </button>
      </div>

      <!-- ── Results ── -->
      <div v-else key="results" class="results-card">
        <div class="result-icon">{{ resultIcon }}</div>
        <h2 class="result-title">{{ resultTitle }}</h2>
        <p class="result-score">{{ score }} / {{ questions.length }} correct</p>
        <div class="result-bar">
          <div class="result-fill" :style="{ width: `${(score / questions.length) * 100}%` }" />
        </div>
        <p class="result-pct">{{ Math.round((score / questions.length) * 100) }}%</p>
        <div class="result-actions">
          <button class="btn" @click="startQuiz(activeCategory)">Play Again</button>
          <button class="btn btn-outline" @click="phase = 'setup'">Change Category</button>
        </div>
      </div>

    </Transition>
  </div>
</template>

<script setup lang="ts">
// ─── Types & constants ───────────────────────────────────────────────────────

interface Question {
  category: string
  question: string
  options: string[]
  answer: number   // index into options
}

const CATEGORIES = [
  { id: 'Geography',   icon: '🌍', color: '#38bdf8' },
  { id: 'Science',     icon: '🔬', color: '#4ade80' },
  { id: 'History',     icon: '📜', color: '#fbbf24' },
  { id: 'Mathematics', icon: '➗', color: '#a78bfa' },
  { id: 'Technology',  icon: '💻', color: '#22d3ee' },
  { id: 'Literature',  icon: '📚', color: '#f472b6' },
  { id: 'Sports',      icon: '⚽', color: '#34d399' },
] as const

const QUIZ_LENGTH = 10
const letters = ['A', 'B', 'C', 'D']

// ─── Question bank ───────────────────────────────────────────────────────────

const ALL_QUESTIONS: Question[] = [
  // Geography
  { category: 'Geography', question: 'What is the capital of Japan?', options: ['Beijing', 'Seoul', 'Tokyo', 'Bangkok'], answer: 2 },
  { category: 'Geography', question: 'What is the longest river in the world?', options: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], answer: 1 },
  { category: 'Geography', question: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Brisbane'], answer: 2 },
  { category: 'Geography', question: 'Which country has the most natural lakes?', options: ['Russia', 'Canada', 'Finland', 'USA'], answer: 1 },
  { category: 'Geography', question: 'What is the smallest country in the world?', options: ['Monaco', 'San Marino', 'Vatican City', 'Liechtenstein'], answer: 2 },
  { category: 'Geography', question: 'Which continent is the Sahara Desert in?', options: ['Asia', 'Africa', 'Australia', 'South America'], answer: 1 },
  { category: 'Geography', question: 'What is the capital of Brazil?', options: ['Rio de Janeiro', 'Brasília', 'São Paulo', 'Manaus'], answer: 1 },
  { category: 'Geography', question: 'Which is the largest ocean?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], answer: 2 },
  { category: 'Geography', question: 'How many continents are there?', options: ['5', '6', '7', '8'], answer: 2 },
  { category: 'Geography', question: 'What is the capital of Canada?', options: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'], answer: 3 },
  { category: 'Geography', question: 'What is the highest mountain in the world?', options: ['K2', 'Mount Everest', 'Kangchenjunga', 'Lhotse'], answer: 1 },
  { category: 'Geography', question: 'Which country does the Amazon River primarily flow through?', options: ['Peru', 'Colombia', 'Brazil', 'Ecuador'], answer: 2 },
  { category: 'Geography', question: 'What is the capital of Egypt?', options: ['Alexandria', 'Cairo', 'Luxor', 'Aswan'], answer: 1 },
  { category: 'Geography', question: 'What is the capital of South Korea?', options: ['Busan', 'Incheon', 'Seoul', 'Daejeon'], answer: 2 },
  { category: 'Geography', question: 'The Great Barrier Reef is off the coast of which country?', options: ['New Zealand', 'Fiji', 'Australia', 'Indonesia'], answer: 2 },
  { category: 'Geography', question: 'What is the capital of India?', options: ['Mumbai', 'Bangalore', 'Kolkata', 'New Delhi'], answer: 3 },
  { category: 'Geography', question: 'Mount Kilimanjaro is located in which country?', options: ['Kenya', 'Ethiopia', 'Uganda', 'Tanzania'], answer: 3 },
  { category: 'Geography', question: 'Which country has the most time zones?', options: ['Russia', 'USA', 'France', 'China'], answer: 2 },
  { category: 'Geography', question: 'What is the capital of Argentina?', options: ['Santiago', 'Montevideo', 'Buenos Aires', 'Lima'], answer: 2 },
  { category: 'Geography', question: 'Which is the largest country in the world by area?', options: ['China', 'USA', 'Canada', 'Russia'], answer: 3 },

  // Science
  { category: 'Science', question: 'What is the chemical symbol for gold?', options: ['Ag', 'Au', 'Fe', 'Cu'], answer: 1 },
  { category: 'Science', question: 'How many planets are in our solar system?', options: ['7', '8', '9', '10'], answer: 1 },
  { category: 'Science', question: 'What is the most abundant gas in Earth\'s atmosphere?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Argon'], answer: 2 },
  { category: 'Science', question: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'], answer: 2 },
  { category: 'Science', question: 'What is the chemical formula for water?', options: ['HO₂', 'H₂O', 'OH', 'H₃O'], answer: 1 },
  { category: 'Science', question: 'How many bones are in the adult human body?', options: ['189', '196', '206', '212'], answer: 2 },
  { category: 'Science', question: 'What gas do plants absorb during photosynthesis?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], answer: 1 },
  { category: 'Science', question: 'Which planet is known as the Red Planet?', options: ['Venus', 'Jupiter', 'Mars', 'Saturn'], answer: 2 },
  { category: 'Science', question: 'What is the most abundant element in the universe?', options: ['Helium', 'Hydrogen', 'Carbon', 'Oxygen'], answer: 1 },
  { category: 'Science', question: 'Which organ in the human body produces insulin?', options: ['Liver', 'Kidney', 'Pancreas', 'Spleen'], answer: 2 },
  { category: 'Science', question: 'What is the chemical symbol for iron?', options: ['Ir', 'In', 'Fe', 'Fr'], answer: 2 },
  { category: 'Science', question: 'What is the approximate speed of light?', options: ['300 km/s', '3,000 km/s', '300,000 km/s', '3,000,000 km/s'], answer: 2 },
  { category: 'Science', question: 'What is the atomic number of carbon?', options: ['4', '6', '8', '12'], answer: 1 },
  { category: 'Science', question: 'What is the unit of electrical resistance?', options: ['Volt', 'Ampere', 'Watt', 'Ohm'], answer: 3 },
  { category: 'Science', question: 'What is the pH of pure water?', options: ['5', '6', '7', '8'], answer: 2 },
  { category: 'Science', question: 'What is the nearest star to Earth, after the Sun?', options: ['Barnard\'s Star', 'Sirius', 'Proxima Centauri', 'Betelgeuse'], answer: 2 },
  { category: 'Science', question: 'How many chambers does the human heart have?', options: ['2', '3', '4', '5'], answer: 2 },
  { category: 'Science', question: 'What force keeps planets in orbit around the Sun?', options: ['Magnetism', 'Friction', 'Electrostatic force', 'Gravity'], answer: 3 },
  { category: 'Science', question: 'What is the chemical symbol for sodium?', options: ['So', 'Sa', 'Na', 'Sd'], answer: 2 },
  { category: 'Science', question: 'How many pairs of chromosomes do humans have?', options: ['20', '23', '26', '30'], answer: 1 },

  // History
  { category: 'History', question: 'In which year did World War II end?', options: ['1943', '1944', '1945', '1946'], answer: 2 },
  { category: 'History', question: 'In which year did the Berlin Wall fall?', options: ['1987', '1988', '1989', '1990'], answer: 2 },
  { category: 'History', question: 'Who was the first US President?', options: ['John Adams', 'Thomas Jefferson', 'Benjamin Franklin', 'George Washington'], answer: 3 },
  { category: 'History', question: 'In which year did the French Revolution begin?', options: ['1776', '1783', '1789', '1795'], answer: 2 },
  { category: 'History', question: 'Who was the first person to walk on the Moon?', options: ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'Alan Shepard'], answer: 2 },
  { category: 'History', question: 'In which year did World War I begin?', options: ['1912', '1913', '1914', '1915'], answer: 2 },
  { category: 'History', question: 'Who invented the printing press?', options: ['Leonardo da Vinci', 'Galileo Galilei', 'Johannes Gutenberg', 'Isaac Newton'], answer: 2 },
  { category: 'History', question: 'In which year did the Titanic sink?', options: ['1910', '1911', '1912', '1913'], answer: 2 },
  { category: 'History', question: 'Who was the first woman to win a Nobel Prize?', options: ['Rosalind Franklin', 'Ada Lovelace', 'Florence Nightingale', 'Marie Curie'], answer: 3 },
  { category: 'History', question: 'In which year did Columbus reach the Americas?', options: ['1488', '1492', '1498', '1502'], answer: 1 },
  { category: 'History', question: 'Who was the last pharaoh of ancient Egypt?', options: ['Nefertiti', 'Cleopatra VII', 'Hatshepsut', 'Ramesses II'], answer: 1 },
  { category: 'History', question: 'Which country was the first to grant women the right to vote?', options: ['Australia', 'USA', 'New Zealand', 'UK'], answer: 2 },
  { category: 'History', question: 'What was the name of the first artificial Earth satellite?', options: ['Explorer 1', 'Vostok 1', 'Sputnik 1', 'Luna 1'], answer: 2 },
  { category: 'History', question: 'In which year did the Russian Revolution take place?', options: ['1905', '1912', '1917', '1921'], answer: 2 },
  { category: 'History', question: 'Which ancient wonder was located in Alexandria, Egypt?', options: ['Hanging Gardens', 'Colossus of Rhodes', 'Lighthouse of Alexandria', 'Temple of Artemis'], answer: 2 },
  { category: 'History', question: 'Who was the first Emperor of Rome?', options: ['Julius Caesar', 'Augustus', 'Nero', 'Caligula'], answer: 1 },
  { category: 'History', question: 'In which city was Archduke Franz Ferdinand assassinated in 1914?', options: ['Vienna', 'Belgrade', 'Sarajevo', 'Budapest'], answer: 2 },
  { category: 'History', question: 'Who wrote the Declaration of Independence?', options: ['George Washington', 'Benjamin Franklin', 'Alexander Hamilton', 'Thomas Jefferson'], answer: 3 },
  { category: 'History', question: 'The ancient city of Carthage was in which modern country?', options: ['Libya', 'Algeria', 'Tunisia', 'Morocco'], answer: 2 },
  { category: 'History', question: 'In which year did the Great Fire of London occur?', options: ['1565', '1616', '1666', '1706'], answer: 2 },

  // Mathematics
  { category: 'Mathematics', question: 'What is the square root of 144?', options: ['10', '11', '12', '13'], answer: 2 },
  { category: 'Mathematics', question: 'What is π (pi) rounded to two decimal places?', options: ['3.12', '3.14', '3.16', '3.18'], answer: 1 },
  { category: 'Mathematics', question: 'What is 2 to the power of 10?', options: ['512', '1024', '2048', '4096'], answer: 1 },
  { category: 'Mathematics', question: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 1 },
  { category: 'Mathematics', question: 'What is 15% of 200?', options: ['25', '30', '35', '40'], answer: 1 },
  { category: 'Mathematics', question: 'What is the sum of angles in a triangle?', options: ['90°', '120°', '180°', '270°'], answer: 2 },
  { category: 'Mathematics', question: 'What is the sum of 1 + 2 + 3 + … + 100?', options: ['4500', '5000', '5050', '5100'], answer: 2 },
  { category: 'Mathematics', question: 'In Roman numerals, what does XL represent?', options: ['14', '34', '40', '60'], answer: 2 },
  { category: 'Mathematics', question: 'What is the next prime number after 7?', options: ['8', '9', '10', '11'], answer: 3 },
  { category: 'Mathematics', question: 'What is the binary representation of decimal 10?', options: ['1000', '1001', '1010', '1100'], answer: 2 },
  { category: 'Mathematics', question: 'How many degrees are in a right angle?', options: ['45°', '60°', '90°', '120°'], answer: 2 },
  { category: 'Mathematics', question: 'What is 7! (seven factorial)?', options: ['2520', '5040', '10080', '40320'], answer: 1 },
  { category: 'Mathematics', question: 'What is the formula for the area of a circle?', options: ['πr', '2πr', 'πr²', '2πr²'], answer: 2 },
  { category: 'Mathematics', question: 'What is the derivative of x³?', options: ['x²', '2x²', '3x²', '3x³'], answer: 2 },
  { category: 'Mathematics', question: 'If a = 2 and b = 3, what is a² + b²?', options: ['10', '13', '15', '25'], answer: 1 },
  { category: 'Mathematics', question: 'What is the value of log₁₀(1000)?', options: ['2', '3', '4', '10'], answer: 1 },
  { category: 'Mathematics', question: 'How many edges does a cube have?', options: ['6', '8', '10', '12'], answer: 3 },
  { category: 'Mathematics', question: 'What is 0.1 + 0.2 mathematically?', options: ['0.1', '0.2', '0.3', '0.4'], answer: 2 },
  { category: 'Mathematics', question: 'What is the least common multiple of 4 and 6?', options: ['8', '10', '12', '24'], answer: 2 },
  { category: 'Mathematics', question: 'A triangle has sides 3, 4 and 5. What type is it?', options: ['Equilateral', 'Isosceles', 'Right-angled', 'Obtuse'], answer: 2 },

  // Technology
  { category: 'Technology', question: 'What does HTTP stand for?', options: ['HyperText Transfer Protocol', 'High Transfer Text Protocol', 'Hybrid Text Transfer Protocol', 'HyperText Terminal Protocol'], answer: 0 },
  { category: 'Technology', question: 'What programming language is Vue.js primarily written in?', options: ['Python', 'Ruby', 'TypeScript/JavaScript', 'Go'], answer: 2 },
  { category: 'Technology', question: 'What does CPU stand for?', options: ['Central Process Unit', 'Central Processing Unit', 'Computer Processing Unit', 'Core Processing Unit'], answer: 1 },
  { category: 'Technology', question: 'What does HTML stand for?', options: ['HyperText Markup Language', 'High-level Text Markup Language', 'HyperText Machine Language', 'Hybrid Text Markup Language'], answer: 0 },
  { category: 'Technology', question: 'How many bits are in a byte?', options: ['4', '8', '16', '32'], answer: 1 },
  { category: 'Technology', question: 'What does RAM stand for?', options: ['Read Access Memory', 'Random Access Memory', 'Rapid Access Memory', 'Real-time Access Memory'], answer: 1 },
  { category: 'Technology', question: 'What does CSS stand for?', options: ['Computer Style Sheet', 'Cascading Style Sheet', 'Creative Style Sheet', 'Coded Style Sheet'], answer: 1 },
  { category: 'Technology', question: 'What does SQL stand for?', options: ['Simple Query Language', 'Standard Query Language', 'Structured Query Language', 'Sequential Query Language'], answer: 2 },
  { category: 'Technology', question: 'What does URL stand for?', options: ['Uniform Resource Locator', 'Universal Resource Locator', 'Unified Resource Link', 'Universal Record Locator'], answer: 0 },
  { category: 'Technology', question: 'What company originally developed JavaScript?', options: ['Microsoft', 'Google', 'Netscape', 'Apple'], answer: 2 },
  { category: 'Technology', question: 'What does API stand for?', options: ['Application Protocol Interface', 'Application Programming Interface', 'Applied Programming Interface', 'Automated Program Interface'], answer: 1 },
  { category: 'Technology', question: 'In which year was the World Wide Web invented?', options: ['1983', '1985', '1989', '1991'], answer: 2 },
  { category: 'Technology', question: 'What does USB stand for?', options: ['Universal System Bus', 'Unified Serial Bus', 'Universal Serial Bus', 'United Serial Bus'], answer: 2 },
  { category: 'Technology', question: 'What is Git primarily used for?', options: ['Database management', 'Web design', 'Version control', 'Network configuration'], answer: 2 },
  { category: 'Technology', question: 'What does IoT stand for?', options: ['Internet of Technology', 'Internet of Things', 'Interface of Things', 'Integration of Technology'], answer: 1 },
  { category: 'Technology', question: 'Which data structure operates on a LIFO principle?', options: ['Queue', 'Linked list', 'Tree', 'Stack'], answer: 3 },
  { category: 'Technology', question: 'What is the main purpose of a firewall?', options: ['Speed up connections', 'Store data', 'Block unauthorized access', 'Encrypt files'], answer: 2 },
  { category: 'Technology', question: 'What does DNS stand for?', options: ['Data Name System', 'Domain Name System', 'Dynamic Name Service', 'Distributed Network Service'], answer: 1 },
  { category: 'Technology', question: 'Which language is primarily used for styling web pages?', options: ['HTML', 'JavaScript', 'CSS', 'PHP'], answer: 2 },
  { category: 'Technology', question: 'What does JSON stand for?', options: ['JavaScript Object Notation', 'Java Serialized Object Notation', 'JavaScript Online Namespace', 'Java Standard Object Node'], answer: 0 },

  // Literature
  { category: 'Literature', question: 'Who wrote "Romeo and Juliet"?', options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], answer: 1 },
  { category: 'Literature', question: 'Who wrote "1984"?', options: ['Aldous Huxley', 'Ray Bradbury', 'George Orwell', 'H.G. Wells'], answer: 2 },
  { category: 'Literature', question: 'Who wrote "Pride and Prejudice"?', options: ['Charlotte Brontë', 'Jane Austen', 'Emily Brontë', 'George Eliot'], answer: 1 },
  { category: 'Literature', question: 'Who wrote "The Great Gatsby"?', options: ['Ernest Hemingway', 'John Steinbeck', 'F. Scott Fitzgerald', 'William Faulkner'], answer: 2 },
  { category: 'Literature', question: 'Who wrote the "Harry Potter" series?', options: ['Roald Dahl', 'Philip Pullman', 'J.K. Rowling', 'Enid Blyton'], answer: 2 },
  { category: 'Literature', question: 'Who wrote "The Odyssey"?', options: ['Sophocles', 'Virgil', 'Ovid', 'Homer'], answer: 3 },
  { category: 'Literature', question: 'Who wrote "Crime and Punishment"?', options: ['Leo Tolstoy', 'Anton Chekhov', 'Fyodor Dostoevsky', 'Ivan Turgenev'], answer: 2 },
  { category: 'Literature', question: 'Who wrote "To Kill a Mockingbird"?', options: ['Truman Capote', 'Harper Lee', 'John Steinbeck', 'William Faulkner'], answer: 1 },
  { category: 'Literature', question: 'Who wrote "The Lord of the Rings"?', options: ['C.S. Lewis', 'J.R.R. Tolkien', 'George R.R. Martin', 'Ursula K. Le Guin'], answer: 1 },
  { category: 'Literature', question: 'What is the name of Sherlock Holmes\'s assistant?', options: ['James Watson', 'Dr. John Watson', 'Dr. Henry Watson', 'Inspector Watson'], answer: 1 },
  { category: 'Literature', question: 'Who wrote "Les Misérables"?', options: ['Gustave Flaubert', 'Émile Zola', 'Alexandre Dumas', 'Victor Hugo'], answer: 3 },
  { category: 'Literature', question: 'Who wrote "Brave New World"?', options: ['George Orwell', 'Aldous Huxley', 'Ray Bradbury', 'Philip K. Dick'], answer: 1 },
  { category: 'Literature', question: 'Who wrote "Don Quixote"?', options: ['Lope de Vega', 'Francisco de Quevedo', 'Miguel de Cervantes', 'Tirso de Molina'], answer: 2 },
  { category: 'Literature', question: 'Who wrote "The Alchemist"?', options: ['Gabriel García Márquez', 'Jorge Luis Borges', 'Paulo Coelho', 'Isabel Allende'], answer: 2 },
  { category: 'Literature', question: 'Who wrote "Moby-Dick"?', options: ['Mark Twain', 'Jack London', 'Herman Melville', 'Nathaniel Hawthorne'], answer: 2 },
  { category: 'Literature', question: 'In which Shakespeare play does Hamlet appear?', options: ['Macbeth', 'Othello', 'King Lear', 'Hamlet'], answer: 3 },
  { category: 'Literature', question: 'Who wrote "Anna Karenina"?', options: ['Anton Chekhov', 'Leo Tolstoy', 'Fyodor Dostoevsky', 'Ivan Turgenev'], answer: 1 },
  { category: 'Literature', question: 'Who wrote "One Hundred Years of Solitude"?', options: ['Mario Vargas Llosa', 'Jorge Luis Borges', 'Gabriel García Márquez', 'Carlos Fuentes'], answer: 2 },
  { category: 'Literature', question: 'What is the subtitle of Mary Shelley\'s "Frankenstein"?', options: ['The Lost Soul', 'The New Adam', 'The Modern Prometheus', 'The Dark Creature'], answer: 2 },
  { category: 'Literature', question: 'Who wrote "The Canterbury Tales"?', options: ['John Milton', 'Geoffrey Chaucer', 'Edmund Spenser', 'Thomas Malory'], answer: 1 },

  // Sports
  { category: 'Sports', question: 'How many players are on a standard soccer team?', options: ['9', '10', '11', '12'], answer: 2 },
  { category: 'Sports', question: 'How many players are on a basketball team on court?', options: ['4', '5', '6', '7'], answer: 1 },
  { category: 'Sports', question: 'What sport is played at Wimbledon?', options: ['Badminton', 'Squash', 'Tennis', 'Table Tennis'], answer: 2 },
  { category: 'Sports', question: 'How long is a marathon?', options: ['26.2 km', '36.2 km', '42.195 km', '50 km'], answer: 2 },
  { category: 'Sports', question: 'How many rings are on the Olympic flag?', options: ['4', '5', '6', '7'], answer: 1 },
  { category: 'Sports', question: 'Which country has won the most FIFA World Cups?', options: ['Germany', 'Italy', 'Argentina', 'Brazil'], answer: 3 },
  { category: 'Sports', question: 'In tennis, what is the term for 40-40?', options: ['Tie', 'Deuce', 'Even', 'Break point'], answer: 1 },
  { category: 'Sports', question: 'How many holes are in a standard round of golf?', options: ['9', '12', '18', '24'], answer: 2 },
  { category: 'Sports', question: 'How many players are on a volleyball team on court?', options: ['5', '6', '7', '8'], answer: 1 },
  { category: 'Sports', question: 'In which sport is the Stanley Cup awarded?', options: ['American Football', 'Basketball', 'Baseball', 'Ice Hockey'], answer: 3 },
  { category: 'Sports', question: 'What is the maximum score in a game of ten-pin bowling?', options: ['200', '250', '300', '360'], answer: 2 },
  { category: 'Sports', question: 'How long is a standard soccer match?', options: ['80 minutes', '85 minutes', '90 minutes', '95 minutes'], answer: 2 },
  { category: 'Sports', question: 'In chess, which piece can only move diagonally?', options: ['Rook', 'Knight', 'Bishop', 'Queen'], answer: 2 },
  { category: 'Sports', question: 'How many points is a touchdown worth in American football?', options: ['4', '5', '6', '7'], answer: 2 },
  { category: 'Sports', question: 'What sport uses a shuttlecock?', options: ['Squash', 'Badminton', 'Racquetball', 'Padel'], answer: 1 },
  { category: 'Sports', question: 'In which sport would you perform a slam dunk?', options: ['Volleyball', 'Basketball', 'Handball', 'Water polo'], answer: 1 },
  { category: 'Sports', question: 'How many sets does a player need to win a men\'s Grand Slam tennis match?', options: ['2', '3', '4', '5'], answer: 1 },
  { category: 'Sports', question: 'How many players are on a rugby union team?', options: ['13', '15', '17', '18'], answer: 1 },
  { category: 'Sports', question: 'In Formula 1, how many points does the race winner receive?', options: ['20', '22', '25', '30'], answer: 2 },
  { category: 'Sports', question: 'Which country hosted the 2016 Summer Olympics?', options: ['China', 'UK', 'Japan', 'Brazil'], answer: 3 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

// Randomise answer positions so the correct answer isn't always at the same index
function scrambleAnswers(q: Question): Question {
  const indexed = q.options.map((opt, i) => ({ opt, correct: i === q.answer }))
  const scrambled = shuffle(indexed)
  return {
    ...q,
    options: scrambled.map(x => x.opt),
    answer: scrambled.findIndex(x => x.correct),
  }
}

function countFor(cat: string) {
  return ALL_QUESTIONS.filter(q => q.category === cat).length
}

// ─── Reactive state ───────────────────────────────────────────────────────────

const phase = ref<'setup' | 'playing' | 'results'>('setup')
const sound = useSound()
useMusic('quiz')

watch(phase, p => {
  if (p !== 'results') return
  const pct = score.value / questions.value.length
  if (pct >= 0.7) sound.win()
  else sound.gameOver()
})
const questions = ref<Question[]>([])
const current = ref(0)
const score = ref(0)
const selected = ref<number | null>(null)
const answered = ref(false)
const activeCategory = ref<string | null>(null)

const q = computed(() => questions.value[current.value]!)

// ─── Actions ─────────────────────────────────────────────────────────────────

function startQuiz(category: string | null) {
  const pool = category
    ? ALL_QUESTIONS.filter(q => q.category === category)
    : ALL_QUESTIONS

  questions.value = shuffle(pool).slice(0, QUIZ_LENGTH).map(scrambleAnswers)
  activeCategory.value = category
  current.value = 0
  score.value = 0
  selected.value = null
  answered.value = false
  phase.value = 'playing'
}

function answer(i: number) {
  if (answered.value) return
  selected.value = i
  answered.value = true
  if (i === q.value.answer) { score.value++; sound.correct() }
  else sound.wrong()
}

function next() {
  if (current.value < questions.value.length - 1) {
    current.value++
    selected.value = null
    answered.value = false
  } else {
    phase.value = 'results'
  }
}

function optionClass(i: number): string {
  if (!answered.value) return ''
  if (i === q.value.answer) return 'correct'
  if (i === selected.value) return 'wrong'
  return 'dimmed'
}

const resultIcon = computed(() => {
  const pct = score.value / questions.value.length
  if (pct >= 0.9) return '🏆'
  if (pct >= 0.7) return '🌟'
  if (pct >= 0.5) return '👍'
  return '📚'
})

const resultTitle = computed(() => {
  const pct = score.value / questions.value.length
  if (pct >= 0.9) return 'Outstanding!'
  if (pct >= 0.7) return 'Great Job!'
  if (pct >= 0.5) return 'Not Bad!'
  return 'Keep Learning!'
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 40px;
  background: radial-gradient(ellipse at top, #0a1f2e 0%, #0f0f1a 70%);
}

.nav {
  width: 100%;
  max-width: 620px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.back {
  font-size: 0.9rem;
  color: #64748b;
  transition: color 0.15s;
}
.back:hover { color: #94a3b8; }

.progress-label {
  font-size: 0.875rem;
  color: #64748b;
}

.mute-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 2px 4px;
  opacity: 0.5;
  transition: opacity 0.15s;
  line-height: 1;
}
.mute-btn:hover { opacity: 1; }

/* ── Setup card ── */
.setup-card {
  width: 100%;
  max-width: 620px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 16px;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.setup-title {
  font-size: 1.6rem;
  font-weight: 900;
  color: #f1f5f9;
}

.setup-sub {
  margin-top: -16px;
  font-size: 0.875rem;
  color: #64748b;
}

.mixed-btn {
  padding: 16px 24px;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #0f172a;
  font-size: 1rem;
  font-weight: 700;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: opacity 0.15s, transform 0.15s;
}
.mixed-btn:hover { opacity: 0.9; transform: translateY(-2px); }

.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.cat-btn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background: #252538;
  border: 1px solid #2d2d44;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, transform 0.15s, background 0.15s;
}
.cat-btn:hover {
  border-color: var(--c);
  background: #2a2a40;
  transform: translateY(-2px);
}

.cat-icon { font-size: 1.6rem; line-height: 1; }

.cat-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--c);
}

.cat-count {
  font-size: 0.75rem;
  color: #64748b;
}

/* ── Quiz card ── */
.quiz-card,
.results-card {
  width: 100%;
  max-width: 620px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 16px;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.progress-bar {
  height: 4px;
  background: #2d2d44;
  border-radius: 99px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  border-radius: 99px;
  transition: width 0.3s ease;
}

.category {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #38bdf8;
}

.question {
  font-size: 1.25rem;
  font-weight: 700;
  color: #f1f5f9;
  line-height: 1.5;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: #252538;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  color: #e2e8f0;
  font-size: 0.95rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.option:hover:not(:disabled) {
  background: #2d2d4e;
  border-color: #38bdf8;
  transform: translateX(2px);
}

.option-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 28px;
  background: #1e1e2e;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
}

.option.correct { background: #14532d; border-color: #4ade80; color: #bbf7d0; }
.option.correct .option-letter { background: #166534; color: #4ade80; }
.option.wrong { background: #450a0a; border-color: #f87171; color: #fecaca; }
.option.wrong .option-letter { background: #7f1d1d; color: #f87171; }
.option.dimmed { opacity: 0.4; }

.next-btn {
  align-self: flex-end;
  padding: 12px 24px;
  background: #38bdf8;
  color: #0f172a;
  font-size: 0.95rem;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.next-btn:hover { opacity: 0.9; transform: scale(1.03); }

/* ── Results card ── */
.results-card {
  align-items: center;
  text-align: center;
  gap: 16px;
  padding: 48px 40px;
}

.result-icon { font-size: 3.5rem; }

.result-title {
  font-size: 2rem;
  font-weight: 900;
  color: #f1f5f9;
}

.result-score { font-size: 1.1rem; color: #94a3b8; }

.result-bar {
  width: 100%;
  height: 8px;
  background: #2d2d44;
  border-radius: 99px;
  overflow: hidden;
}

.result-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  border-radius: 99px;
  transition: width 0.8s ease;
}

.result-pct {
  font-size: 1.5rem;
  font-weight: 900;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.result-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.btn {
  padding: 12px 32px;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #0f172a;
  font-size: 1rem;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.btn:hover { opacity: 0.9; transform: scale(1.03); }

.btn-outline {
  background: transparent;
  color: #38bdf8;
  border: 1px solid #38bdf8;
}

/* ── Slide transition ── */
.slide-enter-active, .slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.slide-enter-from { opacity: 0; transform: translateX(30px); }
.slide-leave-to { opacity: 0; transform: translateX(-30px); }
</style>
