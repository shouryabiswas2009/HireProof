"""
Tests for the from-scratch logistic regression.

The most valuable one here is test_gradient_matches_numerical_estimate: it
checks the hand-derived calculus in train() against a brute-force estimate
of the same slope. A wrong gradient formula is the classic way a
from-scratch model ends up quietly learning badly rather than crashing, so
it is worth proving.
"""

import math
import unittest

from ghostjob import logreg


class SigmoidTests(unittest.TestCase):
    def test_midpoint_and_direction(self):
        self.assertAlmostEqual(logreg.sigmoid(0), 0.5)
        self.assertGreater(logreg.sigmoid(2), 0.5)
        self.assertLess(logreg.sigmoid(-2), 0.5)

    def test_symmetry(self):
        # sigma(-z) should equal 1 - sigma(z)
        for z in (0.3, 1.0, 4.2):
            self.assertAlmostEqual(logreg.sigmoid(-z), 1 - logreg.sigmoid(z))

    def test_extreme_values_do_not_overflow(self):
        # The naive 1/(1+e^-z) form raises OverflowError once z is about
        # -746, because e^746 exceeds the largest float. Ours must return a
        # sensible number instead of crashing.
        self.assertAlmostEqual(logreg.sigmoid(1000), 1.0)
        self.assertAlmostEqual(logreg.sigmoid(-1000), 0.0)
        # Both ends saturate to exactly 1.0 and 0.0 here: the true values
        # are closer to 0 and 1 than any float can represent, so this is
        # floating point's limit, not a bug. log_loss clamps before taking
        # a logarithm precisely so these saturated values stay safe.
        self.assertTrue(math.isfinite(logreg.sigmoid(-1000)))
        self.assertTrue(math.isfinite(logreg.sigmoid(1000)))


class LogLossTests(unittest.TestCase):
    def test_confident_and_correct_beats_confident_and_wrong(self):
        rows, labels = [[1.0]], [1]
        good = logreg.log_loss(rows, labels, [10.0], 0.0)   # predicts ~1, truth 1
        bad = logreg.log_loss(rows, labels, [-10.0], 0.0)   # predicts ~0, truth 1
        self.assertLess(good, 0.01)
        self.assertGreater(bad, 5.0)

    def test_no_crash_on_certainty(self):
        # Without clamping, a prediction of exactly 0 or 1 gives ln(0).
        loss = logreg.log_loss([[1.0]], [0], [1000.0], 0.0)
        self.assertTrue(math.isfinite(loss))


class GradientTests(unittest.TestCase):
    def test_gradient_matches_numerical_estimate(self):
        """Compare the analytical gradient with a numerical one.

        The numerical slope of the loss with respect to one weight is just
        (loss(w + h) - loss(w - h)) / 2h for a tiny h. If our calculus is
        right, the two agree to several decimal places.
        """
        rows = [[1.0, 2.0], [-1.0, 0.5], [0.3, -2.0], [2.0, 1.0]]
        labels = [1, 0, 0, 1]
        weights = [0.4, -0.2]
        bias = 0.1
        n = len(rows)

        # Analytical gradient, the same formula train() uses (l2=0 here).
        predictions = [logreg.predict_probability(r, weights, bias) for r in rows]
        errors = [p - y for p, y in zip(predictions, labels)]
        analytical = [
            sum(e * r[j] for r, e in zip(rows, errors)) / n for j in range(2)
        ]

        h = 1e-6
        for j in range(2):
            up = list(weights)
            down = list(weights)
            up[j] += h
            down[j] -= h
            numerical = (
                logreg.log_loss(rows, labels, up, bias)
                - logreg.log_loss(rows, labels, down, bias)
            ) / (2 * h)
            self.assertAlmostEqual(analytical[j], numerical, places=6)

    def test_bias_gradient_matches_numerical_estimate(self):
        rows = [[1.0], [-2.0], [0.5]]
        labels = [1, 0, 1]
        weights = [0.3]
        bias = -0.2
        predictions = [logreg.predict_probability(r, weights, bias) for r in rows]
        analytical = sum(p - y for p, y in zip(predictions, labels)) / len(rows)

        h = 1e-6
        numerical = (
            logreg.log_loss(rows, labels, weights, bias + h)
            - logreg.log_loss(rows, labels, weights, bias - h)
        ) / (2 * h)
        self.assertAlmostEqual(analytical, numerical, places=6)


class KnownValueTests(unittest.TestCase):
    """Fixed inputs with hand-computable outputs.

    The other tests check properties (loss falls, weights shrink under L2,
    the gradient matches a numerical estimate). Those would all still pass
    if the arithmetic were off by a constant factor, so this pins a few
    exact values worked out by hand.
    """

    def test_sigmoid_of_known_inputs(self):
        # sigma(0) = 0.5 exactly; sigma(1) = 1/(1+e^-1) = 0.7310585786...
        self.assertAlmostEqual(logreg.sigmoid(0.0), 0.5, places=12)
        self.assertAlmostEqual(logreg.sigmoid(1.0), 0.7310585786300049, places=12)
        self.assertAlmostEqual(logreg.sigmoid(-2.0), 0.11920292202211755, places=12)

    def test_prediction_for_hand_computed_weights(self):
        # z = bias + w.x = 0.5 + (2.0 * 1.5) + (-1.0 * 0.25)
        #   = 0.5 + 3.0 - 0.25 = 3.25
        # sigma(3.25) = 1 / (1 + e^-3.25) = 0.9626731126558706
        probability = logreg.predict_probability([1.5, 0.25], [2.0, -1.0], 0.5)
        self.assertAlmostEqual(probability, 0.9626731126558706, places=12)

    def test_log_loss_of_a_hand_computed_case(self):
        # One example, truth 1, prediction sigma(0) = 0.5.
        # loss = -ln(0.5) = 0.6931471805...
        loss = logreg.log_loss([[0.0]], [1], [0.0], 0.0)
        self.assertAlmostEqual(loss, math.log(2), places=12)

    def test_one_gradient_step_moves_weights_by_the_expected_amount(self):
        # A single example: x = [2.0], y = 1, starting from w = 0, b = 0.
        # Prediction is sigma(0) = 0.5, so the error is 0.5 - 1 = -0.5.
        # Gradient for w = error * x = -0.5 * 2.0 = -1.0 (averaged over one
        # example). With learning_rate 0.1 and no L2:
        #     w = 0 - 0.1 * (-1.0) = +0.1
        #     b = 0 - 0.1 * (-0.5) = +0.05
        weights, bias, _ = logreg.train(
            [[2.0]], [1], learning_rate=0.1, epochs=1, l2=0.0
        )
        self.assertAlmostEqual(weights[0], 0.1, places=12)
        self.assertAlmostEqual(bias, 0.05, places=12)

    def test_standardizing_a_known_column(self):
        # Values 2, 4, 6: mean 4, population std sqrt(8/3) = 1.632993...
        means, stds = logreg.standardize_fit([[2.0], [4.0], [6.0]])
        self.assertAlmostEqual(means[0], 4.0, places=12)
        self.assertAlmostEqual(stds[0], math.sqrt(8 / 3), places=12)
        scaled = logreg.standardize_apply([[6.0]], means, stds)[0][0]
        self.assertAlmostEqual(scaled, 2.0 / math.sqrt(8 / 3), places=12)


class TrainTests(unittest.TestCase):
    def test_learns_a_separable_pattern(self):
        # Feature 1 perfectly predicts the label; feature 2 is pure noise.
        rows = [[2.0, 0.1], [1.5, -0.3], [-2.0, 0.2], [-1.6, -0.1]]
        labels = [1, 1, 0, 0]
        weights, bias, history = logreg.train(rows, labels, epochs=3000, l2=0.0)

        # The informative feature should get a clearly positive weight...
        self.assertGreater(weights[0], 1.0)
        # ...and much more influence than the noise feature.
        self.assertGreater(abs(weights[0]), abs(weights[1]) * 3)
        # And it should classify its own training data correctly.
        for row, y in zip(rows, labels):
            p = logreg.predict_probability(row, weights, bias)
            self.assertEqual(1 if p >= 0.5 else 0, y)

    def test_loss_goes_down(self):
        rows = [[1.0], [2.0], [-1.0], [-2.0]]
        labels = [1, 1, 0, 0]
        _, _, history = logreg.train(rows, labels, epochs=1000, l2=0.0)
        losses = [loss for _, loss in history]
        self.assertLess(losses[-1], losses[0])
        # It should fall steadily, never bounce upward (a sign of too high
        # a learning rate).
        for earlier, later in zip(losses, losses[1:]):
            self.assertLessEqual(later, earlier + 1e-9)

    def test_l2_shrinks_weights(self):
        rows = [[2.0, 0.1], [1.5, -0.3], [-2.0, 0.2], [-1.6, -0.1]]
        labels = [1, 1, 0, 0]
        unpenalized, _, _ = logreg.train(rows, labels, epochs=2000, l2=0.0)
        penalized, _, _ = logreg.train(rows, labels, epochs=2000, l2=50.0)
        self.assertLess(abs(penalized[0]), abs(unpenalized[0]))

    def test_empty_data_raises(self):
        with self.assertRaises(ValueError):
            logreg.train([], [])


class StandardizeTests(unittest.TestCase):
    def test_produces_mean_zero_and_unit_spread(self):
        rows = [[10.0], [20.0], [30.0], [40.0]]
        means, stds = logreg.standardize_fit(rows)
        self.assertAlmostEqual(means[0], 25.0)
        scaled = [row[0] for row in logreg.standardize_apply(rows, means, stds)]
        self.assertAlmostEqual(sum(scaled) / len(scaled), 0.0)
        spread = math.sqrt(sum(v * v for v in scaled) / len(scaled))
        self.assertAlmostEqual(spread, 1.0)

    def test_far_out_values_are_clamped(self):
        # mean 4, std sqrt(8/3) = 1.633. A value of 100 is 58.8 standard
        # deviations out, which the model has no fitted opinion about.
        means, stds = logreg.standardize_fit([[2.0], [4.0], [6.0]])
        self.assertEqual(
            logreg.standardize_apply([[100.0]], means, stds)[0][0],
            logreg.CLAMP_SIGMAS,
        )
        self.assertEqual(
            logreg.standardize_apply([[-100.0]], means, stds)[0][0],
            -logreg.CLAMP_SIGMAS,
        )

    def test_values_inside_the_range_are_untouched(self):
        # The clamp must not disturb ordinary values, or every weight learned
        # before it existed would shift meaning.
        means, stds = logreg.standardize_fit([[2.0], [4.0], [6.0]])
        expected = 2.0 / math.sqrt(8 / 3)
        self.assertAlmostEqual(
            logreg.standardize_apply([[6.0]], means, stds)[0][0],
            expected,
            places=12,
        )
        self.assertLess(expected, logreg.CLAMP_SIGMAS)

    def test_clamp_stops_one_feature_swamping_the_others(self):
        """The demo-model bug, reduced to its essentials.

        Feature 0 has a tiny spread in training, so an unseen value lands
        dozens of standard deviations out. Unclamped, its contribution alone
        drives the sigmoid to a hard 0 and the other ten features cannot be
        seen in the answer at all. The score stops being about the posting.
        """
        means, stds = logreg.standardize_fit([[4.0], [4.1], [4.2]])
        weights, bias = [-0.33], 0.0

        unclamped = logreg.standardize_apply([[6.8]], means, stds, clamp=None)[0]
        clamped = logreg.standardize_apply([[6.8]], means, stds)[0]

        self.assertLess(logreg.predict_probability(unclamped, weights, bias), 0.005)
        self.assertGreater(logreg.predict_probability(clamped, weights, bias), 0.2)

    def test_constant_column_does_not_divide_by_zero(self):
        rows = [[5.0, 1.0], [5.0, 2.0], [5.0, 3.0]]
        means, stds = logreg.standardize_fit(rows)
        self.assertEqual(stds[0], 1.0)
        scaled = logreg.standardize_apply(rows, means, stds)
        self.assertTrue(all(math.isfinite(r[0]) for r in scaled))
        self.assertTrue(all(r[0] == 0.0 for r in scaled))


class EvaluateTests(unittest.TestCase):
    def test_metrics_on_a_known_confusion_matrix(self):
        # A single feature with weight 1: positive value predicts ghost.
        rows = [[5.0], [5.0], [-5.0], [-5.0]]
        labels = [1, 0, 0, 1]  # one correct ghost, one false alarm, etc.
        result = logreg.evaluate(rows, labels, [1.0], 0.0)
        self.assertEqual(result["true_positive"], 1)
        self.assertEqual(result["false_positive"], 1)
        self.assertEqual(result["true_negative"], 1)
        self.assertEqual(result["false_negative"], 1)
        self.assertAlmostEqual(result["accuracy"], 0.5)
        self.assertAlmostEqual(result["precision"], 0.5)
        self.assertAlmostEqual(result["recall"], 0.5)

    def test_no_predicted_positives_does_not_divide_by_zero(self):
        rows = [[1.0], [1.0]]
        labels = [1, 1]
        result = logreg.evaluate(rows, labels, [0.0], -100.0)  # always says legit
        self.assertEqual(result["precision"], 0.0)
        self.assertEqual(result["recall"], 0.0)
        self.assertEqual(result["f1"], 0.0)


class CrossValidationTests(unittest.TestCase):
    def test_every_example_is_tested_exactly_once(self):
        folds = logreg.k_fold_indices(23, 5)
        flat = sorted(i for fold in folds for i in fold)
        self.assertEqual(flat, list(range(23)))
        self.assertEqual(len(folds), 5)

    def test_same_seed_gives_same_split(self):
        self.assertEqual(logreg.k_fold_indices(20, 4, seed=7),
                         logreg.k_fold_indices(20, 4, seed=7))

    def test_cross_validate_runs_and_reports(self):
        # A learnable pattern with enough examples for 5 folds.
        rows = [[float(i % 7) + (3.0 if i % 2 else -3.0)] for i in range(30)]
        labels = [1 if i % 2 else 0 for i in range(30)]
        result = logreg.cross_validate(rows, labels, k=5, epochs=500)
        self.assertEqual(len(result["folds"]), 5)
        self.assertIn("accuracy", result["mean"])
        self.assertGreater(result["mean"]["accuracy"], 0.8)


if __name__ == "__main__":
    unittest.main()
