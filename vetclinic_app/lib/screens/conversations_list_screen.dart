import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/conversation.dart';
import '../models/veterinarian.dart';
import '../providers/auth_provider.dart';
import '../providers/conversations_provider.dart';
import '../theme/app_theme.dart';
import 'chat_screen.dart';
import 'veterinarian_picker_screen.dart';

class ConversationsListScreen extends ConsumerStatefulWidget {
  const ConversationsListScreen({super.key});

  @override
  ConsumerState<ConversationsListScreen> createState() => _ConversationsListScreenState();
}

class _ConversationsListScreenState extends ConsumerState<ConversationsListScreen> {
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(conversationsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: _buildBody(state),
      floatingActionButton: FloatingActionButton(
        onPressed: _startNewConversation,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        tooltip: 'Nouvelle conversation',
        child: const Icon(Icons.add),
      ),
    );
  }

  Future<void> _startNewConversation() async {
    final Veterinarian? veterinarian = await Navigator.push<Veterinarian>(
      context,
      MaterialPageRoute(builder: (_) => const VeterinarianPickerScreen()),
    );
    if (veterinarian == null || !mounted) return;

    final conversation = await ref
        .read(conversationsProvider.notifier)
        .createConversation(veterinarianId: veterinarian.id);

    if (!mounted) return;
    if (conversation != null) {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ChatScreen(conversation: conversation)),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Erreur lors de la création de la conversation'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Widget _buildBody(ConversationsState state) {
    switch (state.status) {
      case ConversationsStatus.initial:
      case ConversationsStatus.loading:
        return const Center(child: CircularProgressIndicator());
      case ConversationsStatus.error:
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              Text(state.error ?? 'Erreur inconnue'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.read(conversationsProvider.notifier).refresh(),
                child: const Text('Réessayer'),
              ),
            ],
          ),
        );
      case ConversationsStatus.loaded:
        if (state.conversations.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('Aucune conversation', style: TextStyle(fontSize: 18, color: Colors.grey)),
                SizedBox(height: 8),
                Text('Commencez une conversation avec un vétérinaire', style: TextStyle(color: Colors.grey)),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(conversationsProvider.notifier).refresh(),
          child: ListView.builder(
            padding: const EdgeInsets.all(8),
            itemCount: state.conversations.length,
            itemBuilder: (context, index) {
              final conversation = state.conversations[index];
              return _ConversationCard(
                conversation: conversation,
                viewerId: ref.watch(authProvider).user?.id,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => ChatScreen(conversation: conversation)),
                ),
              );
            },
          ),
        );
    }
  }
}

class _ConversationCard extends StatelessWidget {
  final Conversation conversation;
  final String? viewerId;
  final VoidCallback onTap;
  const _ConversationCard({required this.conversation, this.viewerId, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: AppColors.primaryLight,
          child: const Icon(Icons.chat, color: AppColors.primary),
        ),
        title: Text(
          conversation.displayNameFor(viewerId),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text(
          conversation.lastMessage?.content?.isNotEmpty == true
              ? conversation.lastMessage!.content!
              : (conversation.status == 'OPEN' ? 'Ouverte' : 'Fermée'),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: conversation.lastMessage?.content?.isNotEmpty == true
                ? Colors.grey.shade700
                : (conversation.status == 'OPEN' ? AppColors.primary : Colors.grey),
            fontSize: 12,
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}
