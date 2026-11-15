CREATE VIRTUAL TABLE `messages_fts` USING fts5(
  `subject`,
  `sender`,
  `snippet`,
  `body`,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `messages_fts_after_insert` AFTER INSERT ON `messages` BEGIN
  INSERT INTO `messages_fts` (`rowid`, `subject`, `sender`, `snippet`, `body`)
  VALUES (
    new.`seq`,
    new.`subject`,
    coalesce(new.`from_name`, '') || ' ' || coalesce(new.`from_email`, ''),
    new.`snippet`,
    coalesce(new.`text_body`, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_after_delete` AFTER DELETE ON `messages` BEGIN
  DELETE FROM `messages_fts` WHERE `rowid` = old.`seq`;
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_after_update` AFTER UPDATE OF `subject`, `from_name`, `from_email`, `snippet`, `text_body` ON `messages` BEGIN
  DELETE FROM `messages_fts` WHERE `rowid` = old.`seq`;
  INSERT INTO `messages_fts` (`rowid`, `subject`, `sender`, `snippet`, `body`)
  VALUES (
    new.`seq`,
    new.`subject`,
    coalesce(new.`from_name`, '') || ' ' || coalesce(new.`from_email`, ''),
    new.`snippet`,
    coalesce(new.`text_body`, '')
  );
END;
