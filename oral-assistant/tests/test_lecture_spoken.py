import unittest

from lecture_alignment import align, tokens
from lecture_desktop import evaluate


def grade(fr, heard, confidence=-0.1, previous=None):
    return evaluate(
        {"fr": fr},
        {
            "text": heard,
            "segments": [{"avg_logprob": confidence, "no_speech_prob": 0.03}],
        },
        previous,
    )


class SpokenReadingTests(unittest.TestCase):
    def assert_green(self, fr, heard):
        result = grade(fr, heard)
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["accuracy"], 1)
        self.assertEqual(result["coverage"], 1)
        self.assertFalse(result["extras"])
        self.assertEqual(
            [(w["text"], w["mark"]) for w in result["words"]],
            [(w, "good") for w in tokens(fr)],
        )

    def test_hotel_and_reservation_transcripts(self):
        hotel = "Madame Dumont ? Bonjour c’est l’hôtel Cler, à Paris."
        for spelling in ("Clerc", "Clair", "Claire"):
            with self.subTest(spelling=spelling):
                self.assert_green(hotel, hotel.replace("Cler", spelling))
        line = "Vous avez une réservation sur Booking numéro... 11572 ZM."
        for site, code in (("bouquin", "11, 57, 2"), ("Booking", "11, 57 de"),
                           ("bouquet", "11, 57, de"), ("le bouquin", "1157 de")):
            with self.subTest(site=site, code=code):
                self.assert_green(line, f"Vous avez une réservation sur {site} numéro {code} ZM.")
        other_word = grade(line, "Vous avez une exacerbation sur le bouquin numéro 1157 de ZM.")
        self.assertEqual([w["text"] for w in other_word["words"] if w["mark"] != "good"], ["réservation"])
        self.assertIsNone(grade(line, line.replace("11572", "1157 de"), confidence=-1.2)["accuracy"])

    def test_reservation_boundaries(self):
        ref = "Votre réservation sur Booking numéro 11572 ZM est prête."
        for heard, marked in [
            (ref.replace("11572", "11 75 de"), "11572"),
            (ref.replace("11572", "11 57 trois"), "11572"),
            (ref.replace("11572", "1157"), "11572"),
            (ref.replace("Booking", "Expedia"), "booking"),
            (ref.replace("11572 ZM", "1157 de ZA"), "11572"),
            ("Votre réservation sur Booking numéro 1157 de ZM est complète.", "prête"),
        ]:
            with self.subTest(heard=heard):
                self.assertIn(marked, [w["text"] for w in grade(ref, heard)["words"] if w["mark"] != "good"])
        for fr, heard in [("J’ai deux livres.", "J’ai de livres."),
                          ("Je lis sur Booking.", "Je lis sur le bouquin."),
                          ("Le nom est Cler.", "Le nom est Clair."),
                          ("L’hôtel Cler est ouvert.", "L’hôtel Victor est ouvert.")]:
            self.assertLess(align(fr, heard)["accuracy"], 1)

    def test_number_renderings(self):
        for ref, heard in [
            (
                "Nous sommes trois, vous avez une chambre pour 3 personnes ?",
                "Nous sommes 3, vous avez une chambre pour trois personnes ?",
            ),
            (
                "Oui, deux adultes et un enfant de 10 ans.",
                "Oui, 2 adultes et 1 enfant de dix ans.",
            ),
            ("07 22 63 10 07.", "Zéro-sept-vingt-deux-soixante-trois-dix-zéro-sept."),
            ("Appelez le 07 34 12 78 51.", "Appelez le 0734127851."),
            ("Appelez le 07 34 12 78 51.", "Appelez le 07.34.12.78.51."),
            (
                "Votre réservation numéro 11572 ZM.",
                "Votre réservation numéro 11, 57, 2 ZM.",
            ),
            ("Le numéro 11572 ZM.", "Le numéro un un cinq sept deux ZM."),
            (
                "Le numéro 11572 ZM.",
                "Le numéro onze mille cinq cent soixante-douze ZM.",
            ),
            ("Entre 11 h et 15 h.", "Entre onze heures et quinze heures."),
            ("À 13h30.", "À treize heures trente."),
            ("À 13:30.", "À treize heures trente."),
            ("À 13h00.", "À treize heures."),
            (
                "C’est 2,50 € la barquette.",
                "C’est deux euros et cinquante centimes la barquette.",
            ),
            ("C’est 2,50 € la barquette.", "C’est 2 euros 50 la barquette."),
            (
                "C’est 2,50 € la barquette.",
                "C’est deux virgule cinq euros la barquette.",
            ),
            ("Il mesure 1,05 mètre.", "Il mesure un virgule zéro cinq mètre."),
            ("9 € le kilo.", "Neuf euros le kilo."),
            ("Il est au 6e étage.", "Il est au sixième étage."),
            ("Il est au 15e étage.", "Il est au quinzième étage."),
            (
                "Appelez le zéro sept vingt-deux soixante-trois dix zéro sept.",
                "Appelez le 0722631007.",
            ),
            ("Il est dans le dix-huitième.", "Il est dans le 18ème."),
            ("Il a choisi le T2.", "Il a choisi le T deux."),
            (
                "Deux barquettes de 250 grammes.",
                "2 barquettes de deux cent cinquante grammes.",
            ),
            ("Il reste 80 places.", "Il reste quatre-vingts places."),
        ]:
            with self.subTest(ref=ref, heard=heard):
                self.assert_green(ref, heard)

    def test_names_and_silent_greeting(self):
        for ref, heard in [
            ("Ying", "Yin"),
            ("Ying", "Ayin"),
            ("Aicha", "Acha"),
            ("Aicha", "Aïcha"),
            ("Gonzalez", "Gonzalès"),
            ("Matthieu", "Mathieu"),
            ("Angelica", "Angélica"),
            ("Marc", "Mark"),
        ]:
            with self.subTest(name=ref):
                self.assert_green(f"Je m’appelle {ref}.", f"Je m’appelle {heard}.")
        self.assert_green(
            "Enchantée, je m’appelle Nina.", "Enchanté, je m’appelle Nina."
        )

    def test_wrong_words_and_values_remain_visible(self):
        for ref, heard, bad in [
            ("Il a 13 ans.", "Il a trente ans.", "13"),
            ("Il a deux adultes.", "Il a des adultes.", "deux"),
            ("Je paie 2,50 € ici.", "Je paie deux euros quinze ici.", "50"),
            ("Mon numéro 11572 ZM.", "Mon numéro 11, 75, 2 ZM.", "11572"),
            (
                "Appelez le 07 22 63 10 07 demain.",
                "Appelez le 07 22 36 10 07 demain.",
                "63",
            ),
            ("Je suis Nina et toi ?", "Je suis Lina et toi ?", "nina"),
            ("Je suis Ying et toi ?", "Je suis et toi ?", "ying"),
            ("Il y a deux petites tables.", "Il y a 2 grandes tables.", "petites"),
        ]:
            with self.subTest(ref=ref):
                result = grade(ref, heard)
                self.assertIn(
                    bad, [w["text"] for w in result["words"] if w["mark"] == "bad"]
                )
                self.assertNotEqual(result["status"], "pass")
        self.assertNotEqual(align("un ami", "une amie")["accuracy"], 1)
        self.assertIsNone(
            grade("Je suis Ying.", "Je suis Yin.", confidence=-1.1)["accuracy"]
        )

    def test_full_text_and_partial_alignment(self):
        ref = "Bonjour Ying. Nous sommes trois. À 13 h, deux adultes ont rendez-vous."
        self.assert_green(
            ref,
            "Bonjour Yin. Nous sommes 3. À treize heures, 2 adultes ont rendez-vous.",
        )
        result = grade(
            ref,
            "Bonjour Yin. Nous sommes 3. À treize heures, 2 enfants ont rendez-vous.",
        )
        self.assertEqual(
            [w["text"] for w in result["words"] if w["mark"] != "good"], ["adultes"]
        )
