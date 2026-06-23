from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Adds Message.edited_at.

    Uses RunSQL with IF NOT EXISTS so it's safe whether the column is missing
    (normal case) or was already added by hand on a running production DB while
    firefighting — either way the deploy applies cleanly. `state_operations`
    keeps Django's model state in sync so later migrations see the field.
    """

    dependencies = [
        ("chat", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE chat_message "
                "ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone NULL;",
            reverse_sql="ALTER TABLE chat_message DROP COLUMN IF EXISTS edited_at;",
            state_operations=[
                migrations.AddField(
                    model_name="message",
                    name="edited_at",
                    field=models.DateTimeField(blank=True, null=True),
                ),
            ],
        ),
    ]
