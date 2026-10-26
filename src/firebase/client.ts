import { initializeApp } from "firebase/app";

const firebaseConfig = {
    apiKey: "AIzaSyA49aW91LTz5yHIsasierctGdqWDjcqoNA",
    authDomain: "mahir-sms.firebaseapp.com",
    projectId: "mahir-sms",
    storageBucket: "mahir-sms.firebasestorage.app",
    messagingSenderId: "649480371656",
    appId: "1:649480371656:web:c0a38fb8e68e55c75494fd",
    measurementId: "G-EQ01JQVEGJ"
};

export const app = initializeApp(firebaseConfig);