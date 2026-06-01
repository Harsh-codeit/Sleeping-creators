import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import text_similarity as ts


def test_identical_is_one():
    assert ts.jaccard_similarity("hello world", "hello world") == 1.0


def test_disjoint_is_zero():
    assert ts.jaccard_similarity("alpha beta", "gamma delta") == 0.0


def test_empty_is_zero():
    assert ts.jaccard_similarity("", "anything") == 0.0
    assert ts.jaccard_similarity("anything", "") == 0.0


def test_case_and_punct_insensitive():
    assert ts.jaccard_similarity("Hello, World!", "hello world") == 1.0


def test_max_similarity_picks_highest():
    assert ts.max_similarity("hello world", ["nope none", "hello world too"]) > 0.5


def test_is_too_similar_threshold():
    recent = ["you ate perfectly for six days then ruined it on sunday"]
    near = "you ate perfectly for six days then ruined it sunday"
    far = "three hiring mistakes that cost me a company"
    assert ts.is_too_similar(near, recent, threshold=0.6) is True
    assert ts.is_too_similar(far, recent, threshold=0.6) is False
