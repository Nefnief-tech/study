import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:markdown_widget/markdown_widget.dart';

import '../models/types.dart';
import '../stores/auth_store.dart';
import '../stores/registry.dart';
import '../services/api.dart';
import '../theme/app_theme.dart';
import '../utils/utils.dart';
import '../widgets/bits.dart';
import '../widgets/controls.dart';

/// Port of study-room/page.tsx + DocumentsPanel + FlashcardsPanel + ChatPanel.

enum _Tab { documents, flashcards, chat }

class StudyRoomPage extends StatefulWidget {
  const StudyRoomPage({super.key});

  @override
  State<StudyRoomPage> createState() => _StudyRoomPageState();
}

class _StudyRoomPageState extends State<StudyRoomPage> {
  _Tab _tab = _Tab.documents;

  @override
  void initState() {
    super.initState();
    SemesterApi.refreshDocuments();
  }

  @override
  Widget build(BuildContext context) {
    final room = Stores.I.studyroom;
    return ListenableBuilder(
      listenable: Listenable.merge([room, Stores.I.auth]),
      builder: (context, _) {
        final sem = context.sem;
        final documents = room.documents;
        final decks = room.decks;
        final configured = room.configured;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PageHeader(
                    title: 'Study Room',
                    subtitle: 'upload material → generate flashcards → ask questions',
                    trailing: SemChip(
                      mono: true,
                      uppercase: true,
                      tone: configured ? Tone.good : Tone.warn,
                      text: configured ? 'AI ready' : 'AI key missing',
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    ),
                  ),
                  // tabs
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: sem.card,
                      border: Border.all(color: sem.line),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        _tabButton(context, _Tab.documents, Icons.description_outlined, 'Documents',
                            badge: documents.length),
                        _tabButton(context, _Tab.flashcards, Icons.layers_outlined, 'Decks',
                            badge: decks.length),
                        _tabButton(context, _Tab.chat, Icons.chat_bubble_outline, 'Chat'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: switch (_tab) {
                _Tab.documents => const DocumentsTab(),
                _Tab.flashcards => const FlashcardsTab(),
                _Tab.chat => const ChatTab(),
              },
            ),
          ],
        );
      },
    );
  }

  Widget _tabButton(BuildContext context, _Tab tab, IconData icon, String label, {int badge = 0}) {
    final sem = context.sem;
    final selected = _tab == tab;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _tab = tab),
        borderRadius: BorderRadius.circular(9),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: selected ? sem.ink : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 15, color: selected ? sem.paper : sem.inkSoft),
              const SizedBox(width: 6),
              Text(
                label,
                style: Theme.of(context).textTheme.bodySmall!.copyWith(
                      fontSize: 12,
                      fontWeight: selected ? FontWeight.w500 : FontWeight.w400,
                      color: selected ? sem.paper : sem.inkSoft,
                    ),
              ),
              if (badge > 0) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: selected ? sem.paper.withValues(alpha: 0.2) : sem.ink.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$badge',
                    style: Theme.of(context).textTheme.labelSmall!.copyWith(
                          fontSize: 10,
                          color: selected ? sem.paper : sem.inkSoft,
                        ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/* ================================================================
   documents
   ================================================================ */

class DocumentsTab extends StatefulWidget {
  const DocumentsTab({super.key});

  @override
  State<DocumentsTab> createState() => _DocumentsTabState();
}

class _DocumentsTabState extends State<DocumentsTab> {
  List<String> _uploading = [];
  String _error = '';

  Future<void> _pickAndUpload() async {
    final res = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'docx', 'pptx', 'txt', 'md', 'markdown'],
    );
    if (res.isEmpty) return;

    setState(() => _error = '');
    for (final file in res.where((f) => f.path != null)) {
      setState(() => _uploading = [..._uploading, file.name]);
      try {
        final doc = await SemesterApi.uploadDocument(file.path!);
        Stores.I.studyroom.addDocument(doc);
      } on ApiException catch (e) {
        setState(() => _error = e.message);
      } catch (e) {
        setState(() => _error = 'Upload failed — is the server reachable?');
      } finally {
        setState(() => _uploading = _uploading.where((n) => n != file.name).toList());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final room = Stores.I.studyroom;
    final auth = Stores.I.auth;
    final sem = context.sem;
    final signedIn = auth.status == SyncStatus.signedIn;

    return ListenableBuilder(
      listenable: Listenable.merge([room, auth]),
      builder: (context, _) {
        final documents = room.documents;
        final selectedDocIds = room.selectedDocIds;

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            // upload zone
            InkWell(
              onTap: signedIn ? _pickAndUpload : null,
              borderRadius: BorderRadius.circular(16),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                decoration: BoxDecoration(
                  color: sem.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: sem.line, width: 2),
                ),
                child: Column(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: sem.accentSoft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.upload_outlined, size: 20, color: sem.accent),
                    ),
                    const SizedBox(height: 10),
                    Text('Drop your material here',
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    Text(
                      'PDFs, slides (PPTX), DOCX or plain notes (TXT/MD) · up to 20 MB',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(_error, style: TextStyle(color: sem.marker, fontSize: 13)),
            ],
            if (!signedIn) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: sem.amber.withValues(alpha: 0.1),
                  border: Border.all(color: sem.amber.withValues(alpha: 0.4)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Not signed in — uploads need an account, so your files stay private. '
                  'Open Account in the top bar.',
                  style: Theme.of(context).textTheme.bodySmall!.copyWith(color: sem.inkSoft),
                ),
              ),
            ],
            if (_uploading.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                'extracting text · ${_uploading.join(", ")}…',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
            const SizedBox(height: 18),

            if (documents.isEmpty)
              const EmptyState(
                title: 'No documents yet',
                hint:
                    'Upload lecture notes, slides or chapters — they become the context for flashcards and chat.',
              )
            else ...[
              Text(
                '${selectedDocIds.length} of ${documents.length} selected as AI context',
                style: Theme.of(context).textTheme.labelSmall,
              ),
              const SizedBox(height: 8),
              if (selectedDocIds.length < documents.length)
                Align(
                  alignment: Alignment.centerLeft,
                  child: SemGhostButton(
                    onPressed: () =>
                        room.setSelectedDocs(documents.map((d) => d.id).toList()),
                    child: const Text('Select all', style: TextStyle(fontSize: 12)),
                  ),
                ),
              const SizedBox(height: 10),
              for (final doc in documents)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: sem.card,
                    border: Border.all(
                      color: selectedDocIds.contains(doc.id) ? sem.accent.withValues(alpha: 0.5) : sem.line,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      // selection checkbox
                      InkWell(
                        onTap: () => room.toggleSelectedDoc(doc.id),
                        borderRadius: BorderRadius.circular(5),
                        child: Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            color: selectedDocIds.contains(doc.id) ? sem.accent : Colors.transparent,
                            border: Border.all(
                              color:
                                  selectedDocIds.contains(doc.id) ? sem.accent : sem.ink.withValues(alpha: 0.3),
                            ),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: selectedDocIds.contains(doc.id)
                              ? Icon(Icons.check, size: 12, color: sem.paper)
                              : const SizedBox.shrink(),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Icon(
                        doc.kind == DocKind.pptx
                            ? Icons.slideshow_outlined
                            : (doc.kind == DocKind.txt || doc.kind == DocKind.md
                                ? Icons.sticky_note_2_outlined
                                : Icons.description_outlined),
                        size: 16,
                        color: sem.inkSoft,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              doc.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyMedium!
                                  .copyWith(fontWeight: FontWeight.w500),
                            ),
                            Text(
                              '${formatBytes(doc.size)} · ${doc.chars} chars · '
                              '${DateTime.fromMillisecondsSinceEpoch(doc.uploadedAt).day}.'
                              '${DateTime.fromMillisecondsSinceEpoch(doc.uploadedAt).month}.',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ),
                      SemIconButton(
                        icon: Icons.delete_outline,
                        size: 16,
                        onPressed: () async {
                          room.removeDocument(doc.id);
                          try {
                            await SemesterApi.deleteDocument(doc.id);
                          } catch (_) {}
                        },
                      ),
                    ],
                  ),
                ),
            ],
          ],
        );
      },
    );
  }
}

/* ================================================================
   flashcards
   ================================================================ */

class FlashcardsTab extends StatefulWidget {
  const FlashcardsTab({super.key});

  @override
  State<FlashcardsTab> createState() => _FlashcardsTabState();
}

class _FlashcardsTabState extends State<FlashcardsTab> {
  String? _activeDeckId;
  bool _generating = false;
  String _error = '';

  // study state
  List<int> _order = [];
  int _pos = 0;
  bool _flipped = false;
  Set<String> _known = {};
  String? _seenDeckId;

  void _resetStudy(Deck? deck) {
    final n = deck?.cards.length ?? 0;
    _order = List.generate(n, (i) => i)..shuffle();
    _pos = 0;
    _flipped = false;
    _known = {};
    _seenDeckId = deck?.id;
  }

  Future<void> _generate() async {
    final room = Stores.I.studyroom;
    if (room.selectedDocIds.isEmpty) return;
    setState(() {
      _generating = true;
      _error = '';
    });
    try {
      final seed = await SemesterApi.generateFlashcards(room.selectedDocIds.toList());
      final deck = room.addDeck(
        title: seed.title,
        documentIds: room.selectedDocIds.toList(),
        cards: seed.cards,
      );
      setState(() => _activeDeckId = deck.id);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Could not reach the AI provider.');
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final room = Stores.I.studyroom;
    final auth = Stores.I.auth;
    final configured = room.configured;

    return ListenableBuilder(
      listenable: Listenable.merge([room, auth]),
      builder: (context, _) {
        final sem = context.sem;
        final signedIn = auth.status == SyncStatus.signedIn;
        if (!signedIn) return const AuthRequiredNotice(feature: 'generate flashcards');
        if (!configured) return const _SetupNotice();

        final decks = room.decks;
        final deck = decks.where((d) => d.id == _activeDeckId).firstOrNull ?? decks.firstOrNull;

        if (_seenDeckId != deck?.id) {
          // reset study state on deck change — mirrors the web panel
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              setState(() => _resetStudy(deck));
            }
          });
        }

        if (decks.isEmpty) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              EmptyState(
                icon: Icons.layers_outlined,
                title: 'No decks yet',
                hint: room.selectedDocIds.isNotEmpty
                    ? 'Turn your selected documents into a deck of flashcards.'
                    : 'Upload material first and tick it as AI context — then generate your deck.',
                action: SemPrimaryButton(
                  onPressed: _generating || room.selectedDocIds.isEmpty ? null : _generate,
                  child: _generating
                      ? const SizedBox(
                          width: 14, height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(
                          'Generate from ${room.selectedDocIds.length} ${room.selectedDocIds.length == 1 ? 'document' : 'documents'}'),
                ),
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_error, textAlign: TextAlign.center, style: TextStyle(color: sem.marker)),
              ],
            ],
          );
        }

        if (deck == null) return const SizedBox.shrink();
        final Flashcard? card =
            _order.isEmpty || _pos >= _order.length ? null : deck.cards[_order[_pos]];

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            // deck header
            Row(
              children: [
                Expanded(
                  child: decks.length > 1
                      ? DropdownButtonFormField<String>(
                          initialValue: deck.id,
                          isDense: true,
                          decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                          items: [
                            for (final d in decks)
                              DropdownMenuItem(value: d.id, child: Text('${d.title} · ${d.cards.length} cards', overflow: TextOverflow.ellipsis)),
                          ],
                          onChanged: (v) => setState(() => _activeDeckId = v),
                        )
                      : Text(deck.title, style: Theme.of(context).textTheme.headlineSmall),
                ),
                SemGhostButton(
                  onPressed: _generating ? null : _generate,
                  child: _generating
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.add, size: 15),
                          SizedBox(width: 5),
                          Text('New deck'),
                        ]),
                ),
                SemIconButton(
                  icon: Icons.delete_outline,
                  onPressed: () => room.removeDeck(deck.id),
                ),
              ],
            ),
            const SizedBox(height: 14),

            if (card != null) ...[
              // flip card
              GestureDetector(
                onTap: () => setState(() => _flipped = !_flipped),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOutCubic,
                  height: 300,
                  padding: const EdgeInsets.all(28),
                  decoration: BoxDecoration(
                    color: _flipped ? sem.accentSoft : sem.card,
                    border: Border.all(
                      color: _flipped ? sem.accent.withValues(alpha: 0.4) : sem.line,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      Text(
                        _flipped ? 'ANSWER' : 'QUESTION',
                        style: Theme.of(context).textTheme.labelSmall!.copyWith(
                              letterSpacing: 1.4,
                              color: _flipped ? sem.accent : sem.inkSoft,
                            ),
                      ),
                      Expanded(
                        child: Center(
                          child: SingleChildScrollView(
                            child: Text(
                              _flipped ? card.back : card.front,
                              textAlign: TextAlign.center,
                              style: _flipped
                                  ? Theme.of(context).textTheme.bodyLarge!
                                  : Theme.of(context).textTheme.headlineSmall!.copyWith(fontSize: 22),
                            ),
                          ),
                        ),
                      ),
                      Text(
                        'tap to flip',
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall!
                            .copyWith(color: _flipped ? sem.accent : sem.inkSoft),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              // progress
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: Container(
                  height: 6,
                  color: sem.paperDeep,
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: deck.cards.isEmpty ? 0 : _known.length / deck.cards.length,
                    child: Container(color: sem.accent),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              // controls
              Row(
                children: [
                  SemIconButton(
                    icon: Icons.chevron_left,
                    onPressed: _pos == 0
                        ? null
                        : () => setState(() {
                              _flipped = false;
                              _pos = (_pos - 1).clamp(0, _order.length - 1);
                            }),
                  ),
                  Expanded(
                    child: Text(
                      '${_pos + 1} / ${deck.cards.length} · ${_known.length} known',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ),
                  SemIconButton(
                    icon: Icons.shuffle_outlined,
                    onPressed: () => setState(() => _resetStudy(deck)),
                  ),
                  SemIconButton(
                    icon: Icons.restart_alt,
                    onPressed: () => setState(() => _known = {}),
                  ),
                  const SizedBox(width: 4),
                  SemGhostButton(
                    onPressed: () => setState(() {
                      _known = {..._known, card.id};
                      _flipped = false;
                      _pos = (_pos + 1).clamp(0, _order.length - 1);
                    }),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.check, size: 15),
                      SizedBox(width: 5),
                      Text('Known'),
                    ]),
                  ),
                  const SizedBox(width: 6),
                  SemPrimaryButton(
                    onPressed: _pos >= _order.length - 1
                        ? null
                        : () => setState(() {
                              _flipped = false;
                              _pos++;
                            }),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Text('Next'),
                      SizedBox(width: 4),
                      Icon(Icons.chevron_right, size: 16),
                    ]),
                  ),
                ],
              ),
            ] else
              const EmptyState(title: 'Empty deck', hint: 'This deck has no cards.'),

            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(_error, textAlign: TextAlign.center, style: TextStyle(color: sem.marker)),
            ],
          ],
        );
      },
    );
  }
}

/* ================================================================
   chat
   ================================================================ */

class ChatTab extends StatefulWidget {
  const ChatTab({super.key});

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  http.Client? _client;
  bool _streaming = false;
  String _providerError = '';

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    _client?.close();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send() async {
    final room = Stores.I.studyroom;
    final text = _input.text.trim();
    if (text.isEmpty || _streaming) return;
    setState(() {
      _providerError = '';
      _input.clear();
    });
    final prior =
        room.chat.map((m) => ChatMessage(role: m.role, content: m.content)).toList();
    room.appendMessage(ChatMessage(role: 'user', content: text));
    room.appendMessage(const ChatMessage(role: 'assistant', content: ''));

    final history = [...prior, ChatMessage(role: 'user', content: text)];

    final client = http.Client();
    _client = client;
    setState(() => _streaming = true);

    try {
      await for (final update in SemesterApi.streamChat(
        history: history,
        documentIds: room.selectedDocIds.toList(),
        client: client,
      )) {
        switch (update) {
          case ChatDelta(:final content, :final sources):
            room.updateLastAssistant(content, sources);
            _scrollToBottom();
          case ChatError(:final message):
            room.updateLastAssistant(message);
            setState(() => _providerError = message);
        }
      }
    } catch (e) {
      if (e is ApiException) {
        room.updateLastAssistant(e.message);
      } else {
        room.updateLastAssistant('Connection to the AI provider failed.');
        setState(() => _providerError = 'Connection to the AI provider failed.');
      }
    } finally {
      client.close();
      _client = null;
      if (mounted) setState(() => _streaming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final room = Stores.I.studyroom;
    final auth = Stores.I.auth;
    final configured = room.configured;

    return ListenableBuilder(
      listenable: Listenable.merge([room, auth]),
      builder: (context, _) {
        final sem = context.sem;
        final signedIn = auth.status == SyncStatus.signedIn;
        if (!signedIn) return const AuthRequiredNotice(feature: 'chat about your documents');
        if (!configured) return const _SetupNotice();

        final chat = room.chat;
        final documents = room.documents;
        final contextDocs =
            documents.where((d) => room.selectedDocIds.contains(d.id)).toList();
        final contextChars = contextDocs.fold<int>(0, (sum, d) => sum + d.chars);

        return Column(
          children: [
            // context bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'context · ${contextDocs.length} ${contextDocs.length == 1 ? 'document' : 'documents'}'
                      '${contextChars > 0 ? ' · ${(contextChars / 1000).toStringAsFixed(0)}k chars' : ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ),
                  if (chat.isNotEmpty)
                    InkWell(
                      onTap: room.clearChat,
                      child: Row(
                        children: [
                          Icon(Icons.delete_outline, size: 12, color: sem.inkSoft),
                          const SizedBox(width: 3),
                          Text(
                            'CLEAR',
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall!
                                .copyWith(fontSize: 10),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // messages
            Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 16),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: sem.card.withValues(alpha: 0.6),
                  border: Border.all(color: sem.line),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: chat.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.chat_bubble_outline, size: 30, color: sem.inkSoft),
                            const SizedBox(height: 10),
                            Text('Ask your documents',
                                style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: 4),
                            Text(
                              contextDocs.isNotEmpty
                                  ? 'Questions about ${contextDocs.first.name}${contextDocs.length > 1 ? ' and ${contextDocs.length - 1} more selected documents' : ''} — answers cite their sources.'
                                  : 'No documents selected — the assistant will answer from general knowledge. Tick some documents in the Documents tab to ground it.',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        controller: _scroll,
                        itemCount: chat.length,
                        itemBuilder: (context, i) {
                          final m = chat[i];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Row(
                              mainAxisAlignment: m.isUser
                                  ? MainAxisAlignment.end
                                  : MainAxisAlignment.start,
                              children: [
                                Flexible(
                                  child: Container(
                                    constraints: const BoxConstraints(maxWidth: 420),
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 14, vertical: 10),
                                    decoration: BoxDecoration(
                                      color: m.isUser ? sem.ink : sem.card,
                                      border: m.isUser
                                          ? null
                                          : Border.all(color: sem.line),
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        if (m.isUser)
                                          Text(
                                            m.content,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodyMedium!
                                                .copyWith(color: sem.paper),
                                          )
                                        else if (m.content.isNotEmpty)
                                          MarkdownBlock(
                                            data: m.content,
                                            isStreaming:
                                                _streaming && i == chat.length - 1,
                                          )
                                        else
                                          const _TypingDots(),
                                        if (!m.isUser &&
                                            m.sources != null &&
                                            m.sources!.isNotEmpty) ...[
                                          const SizedBox(height: 8),
                                          Container(height: 1, color: sem.line),
                                          const SizedBox(height: 6),
                                          Text(
                                            'sources · ${m.sources!.join(", ")}',
                                            style: Theme.of(context)
                                                .textTheme
                                                .labelSmall!
                                                .copyWith(fontSize: 10),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ),
            if (_providerError.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'provider error · $_providerError',
                    style: TextStyle(color: sem.marker, fontSize: 12),
                  ),
                ),
              ),
            // composer
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration:
                          const InputDecoration(hintText: 'Ask something about your material…'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _streaming
                      ? SemGhostButton(
                          onPressed: () {
                            _client?.close();
                          },
                          child: const Icon(Icons.stop, size: 16),
                        )
                      : SemPrimaryButton(
                          onPressed: _input.text.trim().isEmpty ? null : _send,
                          child: const Icon(Icons.send, size: 16),
                        ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// assistant markdown with a blinking cursor while streaming
class MarkdownBlock extends StatelessWidget {
  final String data;
  final bool isStreaming;
  const MarkdownBlock({super.key, required this.data, this.isStreaming = false});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final body = Theme.of(context).textTheme.bodyMedium ?? const TextStyle(fontSize: 14);
    final small = Theme.of(context).textTheme.bodySmall ?? const TextStyle(fontSize: 12);
    return MarkdownWidget(
      data: data,
      config: MarkdownConfig(configs: [
        PConfig(
          textStyle: body,
        ),
        TableConfig(
          headerStyle: small.copyWith(fontSize: 11, fontWeight: FontWeight.w600),
          bodyStyle: small.copyWith(fontSize: 11),
          headerRowDecoration: BoxDecoration(color: sem.paper),
        ),
        CodeConfig(
          style: Theme.of(context).textTheme.labelMedium?.copyWith(fontSize: 11, color: sem.ink) ??
              TextStyle(fontSize: 11, color: sem.ink),
        ),
        BlockquoteConfig(
          sideColor: sem.accent.withValues(alpha: 0.5),
          textColor: sem.inkSoft,
        ),
      ]),
    );
  }
}

class _TypingDots extends StatefulWidget {
  const _TypingDots();

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 3; i++)
            Container(
              width: 5,
              height: 5,
              margin: const EdgeInsets.only(right: 4),
              decoration: BoxDecoration(
                color: sem.inkSoft.withValues(
                  alpha: 0.35 + 0.55 * ((0.5 + 0.5 * (_c.value * 3 - i)).clamp(0.0, 1.0)),
                ),
                shape: BoxShape.circle,
              ),
            ),
        ],
      ),
    );
  }
}

/* ---------------- notices ---------------- */

class AuthRequiredNotice extends StatelessWidget {
  final String feature;
  const AuthRequiredNotice({super.key, required this.feature});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        CustomPaint(
          foregroundPainter: DashedRRectPainter(color: sem.line),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: sem.card,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: sem.accentSoft,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.person_outline, size: 16, color: sem.accent),
                ),
                const SizedBox(height: 10),
                Text('Sign in to $feature', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text(
                  'AI features are tied to your account so your usage and documents stay private.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SetupNotice extends StatelessWidget {
  const _SetupNotice();

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SemCard(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: sem.accentSoft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.key_outlined, size: 16, color: sem.accent),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('AI is not configured yet',
                        style: Theme.of(context).textTheme.headlineSmall),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'Add an API key to the server .env.local to unlock this feature. Any OpenAI-compatible '
                'provider works — Z.ai, DeepSeek, OpenAI, OpenRouter or a local Ollama.',
                style: Theme.of(context).textTheme.bodyMedium!.copyWith(color: sem.inkSoft, height: 1.5),
              ),
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: sem.paper,
                  border: Border.all(color: sem.line),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'AI_API_KEY=your-key-here\nAI_BASE_URL=https://api.z.ai/api/paas/v4\nAI_MODEL=glm-4.6',
                  style: Theme.of(context).textTheme.labelMedium!.copyWith(
                        fontSize: 11,
                        color: sem.inkSoft,
                        height: 1.6,
                      ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
