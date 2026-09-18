import 'package:flutter/material.dart';

import '../stores/registry.dart';
import '../stores/subjects_store.dart' show AddSubjectInput;
import '../theme/app_theme.dart';
import 'bits.dart';
import 'controls.dart';

/// Port of SubjectSelect.tsx — subject picker with an inline "new subject"
/// flow, rendered as choice chips (mobile-friendlier than a dropdown).
class SubjectSelect extends StatefulWidget {
  final String? value;
  final ValueChanged<String?> onChanged;
  const SubjectSelect({super.key, required this.value, required this.onChanged});

  @override
  State<SubjectSelect> createState() => _SubjectSelectState();
}

class _SubjectSelectState extends State<SubjectSelect> {
  bool _creating = false;
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _create() {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    final subject = Stores.I.subjects.addSubject(AddSubjectInput(name));
    _nameController.clear();
    setState(() => _creating = false);
    widget.onChanged(subject.id);
  }

  @override
  Widget build(BuildContext context) {
    final subjects = Stores.I.subjects.subjects;

    return ListenableBuilder(
      listenable: Stores.I.subjects,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SemLabel('Subject'),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _pickChip(
                context,
                selected: widget.value == null,
                label: 'No subject',
                onTap: () => widget.onChanged(null),
              ),
              for (final s in subjects)
                _pickChip(
                  context,
                  selected: widget.value == s.id,
                  label: s.name,
                  leading: SubjectDot(s.color, size: 8),
                  onTap: () => widget.onChanged(s.id),
                ),
              _pickChip(
                context,
                selected: false,
                label: '+ New subject…',
                onTap: () => setState(() => _creating = true),
              ),
            ],
          ),
          if (_creating) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _nameController,
                    autofocus: true,
                    decoration: const InputDecoration(hintText: 'e.g. Mathematics'),
                    onSubmitted: (_) => _create(),
                  ),
                ),
                const SizedBox(width: 8),
                SemPrimaryButton(onPressed: _create, child: const Text('Add')),
                const SizedBox(width: 8),
                SemGhostButton(
                  onPressed: () {
                    _nameController.clear();
                    setState(() => _creating = false);
                  },
                  child: const Text('Cancel'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _pickChip(
    BuildContext context, {
    required bool selected,
    required String label,
    Widget? leading,
    required VoidCallback onTap,
  }) {
    final sem = context.sem;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: selected ? sem.ink : sem.paper,
          border: Border.all(color: selected ? sem.ink : sem.line),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (leading != null) ...[
              leading,
              const SizedBox(width: 5),
            ],
            Text(
              label,
              style: Theme.of(context).textTheme.bodySmall!.copyWith(
                    fontSize: 12,
                    color: selected ? sem.paper : sem.ink,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
