import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";

class FirebaseConnection {
  private app;
  private auth;

  constructor() {
    const firebaseConfig = {
      apiKey: process.env.MONS_FIREBASE_API_KEY || "AIzaSyC709PHiVSQqIvCqaJwx3h9Mg55ysgBrRg",
      authDomain: "mons-e34e5.firebaseapp.com",
      databaseURL: "https://mons-e34e5-default-rtdb.firebaseio.com",
      projectId: "mons-e34e5",
      storageBucket: "mons-e34e5.appspot.com",
      messagingSenderId: "949028813912",
      appId: "1:949028813912:web:d06d6dfaa574ca920fde2d",
    };

    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
  }

  public signIn(): Promise<string | undefined> {
    return new Promise((resolve) => {
      signInAnonymously(this.auth)
        .then(() => {
          const uid = this.auth.currentUser?.uid;
          resolve(uid);
        })
        .catch(() => {
          resolve(undefined);
        });
    });
  }

  public createInvite(id: string) {
    console.log("yo will create invite", id);
    // TODO: implement
  }
}

export const firebaseConnection = new FirebaseConnection();
