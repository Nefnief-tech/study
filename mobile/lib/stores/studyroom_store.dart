import '../models/types.dart';
import '../utils/utils.dart';
import 'base.dart';

class StudyroomStore extends PersistedStore {
  @override
  String get storageKey => 'semester.studyroom';

  @override
  int get storageVersion => 2;

  /// server-side document metadata — refetched on mount, NOT persisted
  List<StudyDoc> _documents = [];
  List<StudyDoc> get documents => List.unmodifiable(_documents);

  bool _configured = false;
  bool get configured => _configured;

  /// which documents feed flashcards & chat
  List<String> _selectedDocIds = [];
  List<String> get selectedDocIds => List.unmodifiable(_selectedDocIds);

  List<Deck> _decks = [];
  List<Deck> get decks => List.unmodifiable(_decks);

  /// decks deleted while a cloud sync was unavailable/pending
  List<String> _deletedDeckIds = [];
  List<String> get deletedDeckIds => List.unmodifiable(_deletedDeckIds);

  List<ChatMessage> _chat = [];
  List<ChatMessage> get chat => List.unmodifiable(_chat);

  @override
  Map<String, dynamic> persistedState() => {
        'selectedDocIds': _selectedDocIds,
        'decks': _decks.map((d) => d.toJson()).toList(),
        'deletedDeckIds': _deletedDeckIds,
        'chat': _chat.map((m) => m.toJson()).toList(),
      };

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    _selectedDocIds = ((state['selectedDocIds'] as List?) ?? [])
        .map((e) => e as String)
        .toList();
    _decks = ((state['decks'] as List?) ?? [])
        .map((e) => Deck.fromJson(e as Map<String, dynamic>))
        .toList();
    _deletedDeckIds = ((state['deletedDeckIds'] as List?) ?? [])
        .map((e) => e as String)
        .toList();
    _chat = ((state['chat'] as List?) ?? [])
        .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // -- documents (server-backed, not persisted) --

  void setDocuments(List<StudyDoc> documents, bool configured) {
    _documents = documents;
    _configured = configured;
    notifyListeners();
  }

  void addDocument(StudyDoc doc) {
    _documents = [doc, ..._documents];
    notifyListeners();
  }

  void removeDocument(String id) {
    _documents = _documents.where((d) => d.id != id).toList();
    _selectedDocIds = _selectedDocIds.where((x) => x != id).toList();
    notifyListeners();
  }

  // -- selection --

  void toggleSelectedDoc(String id) {
    _selectedDocIds = _selectedDocIds.contains(id)
        ? _selectedDocIds.where((x) => x != id).toList()
        : [..._selectedDocIds, id];
    notifyListeners();
    persist();
  }

  void setSelectedDocs(List<String> ids) {
    _selectedDocIds = ids;
    notifyListeners();
    persist();
  }

  // -- decks --

  Deck addDeck({required String title, required List<String> documentIds, required List<Flashcard> cards}) {
    final full = Deck(
      id: uid(),
      title: title,
      documentIds: documentIds,
      createdAt: DateTime.now().millisecondsSinceEpoch,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
      cards: cards,
    );
    _decks = [full, ..._decks];
    notifyListeners();
    persist();
    return full;
  }

  void removeDeck(String id) {
    _decks = _decks.where((d) => d.id != id).toList();
    _deletedDeckIds = [..._deletedDeckIds, id];
    notifyListeners();
    persist();
  }

  void replaceDecks(List<Deck> decks) {
    _decks = decks;
    notifyListeners();
  }

  void clearDeletedDeckIds(List<String> ids) {
    _deletedDeckIds = _deletedDeckIds.where((id) => !ids.contains(id)).toList();
    notifyListeners();
    persist();
  }

  // -- silent replaces used by the sync engine --

  void replaceSelectedDocIds(List<String> ids) {
    _selectedDocIds = ids;
    notifyListeners();
    persist();
  }

  void replaceChat(List<ChatMessage> messages) {
    _chat = messages;
    notifyListeners();
    persist();
  }

  void upsertDeck(Deck deck) {
    _decks = [..._decks.where((d) => d.id != deck.id), deck];
    notifyListeners();
    persist();
  }

  // -- chat --

  void appendMessage(ChatMessage message) {
    _chat = [..._chat, message];
    notifyListeners();
    persist();
  }

  void updateLastAssistant(String content, [List<String>? sources]) {
    if (_chat.isEmpty || _chat.last.isUser) return;
    final chat = [..._chat];
    chat[chat.length - 1] = ChatMessage(role: 'assistant', content: content, sources: sources);
    _chat = chat;
    notifyListeners();
    persist();
  }

  void clearChat() {
    _chat = [];
    notifyListeners();
    persist();
  }
}
